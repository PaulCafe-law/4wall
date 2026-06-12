from __future__ import annotations

from datetime import datetime, timezone
import base64
import json
import logging
from pathlib import Path
import tempfile
from typing import Any, Callable
from zipfile import ZIP_DEFLATED, ZipFile

from sqlalchemy import text
from sqlmodel import Session, select

from app.config import Settings
from app.industrial_data_engine.constants import (
    INDUSTRIAL_VOCABULARY,
    PRIORITY_REFINEMENT_LABELS,
    STAGES,
)
from app.industrial_data_engine.providers import IndustrialProviderError, ProviderBundle, build_provider_bundle
from app.industrial_data_engine.storage import IndustrialArtifactStore
from app.models import IndustrialEngineInputAsset, IndustrialEngineJob, IndustrialEngineJobStage


logger = logging.getLogger(__name__)

ProviderFactory = Callable[[Settings], ProviderBundle]

OPENAI_IGNORED_MESSAGE = (
    "This project does not use OpenAI API keys. "
    "Use ChatGPT OAuth for Codex development login."
)


def ensure_job_stages(session: Session, job_id: str) -> None:
    existing = {
        stage.name
        for stage in session.exec(
            select(IndustrialEngineJobStage).where(IndustrialEngineJobStage.job_id == job_id)
        )
    }
    for sequence, name in STAGES:
        if name not in existing:
            session.add(IndustrialEngineJobStage(job_id=job_id, sequence=sequence, name=name))
    session.flush()


def process_next_queued_job(
    *,
    session: Session,
    settings: Settings,
    provider_factory: ProviderFactory = build_provider_bundle,
) -> str | None:
    job = session.exec(
        select(IndustrialEngineJob)
        .where(IndustrialEngineJob.status == "queued")
        .order_by(IndustrialEngineJob.created_at)
    ).first()
    if job is None:
        return None
    run_industrial_engine_job(session=session, settings=settings, job_id=job.id, provider_factory=provider_factory)
    return job.id


def run_industrial_engine_job(
    *,
    session: Session,
    settings: Settings,
    job_id: str,
    provider_factory: ProviderFactory = build_provider_bundle,
) -> None:
    job = session.get(IndustrialEngineJob, job_id)
    if job is None:
        raise ValueError("industrial_engine_job_not_found")

    ensure_job_stages(session, job.id)
    store = IndustrialArtifactStore.from_settings(settings)
    now = _now()
    job.status = "running"
    job.started_at = job.started_at or now
    job.updated_at = now
    session.add(job)
    session.commit()

    context: dict[str, Any] = {"job": job, "settings": settings, "store": store}
    with tempfile.TemporaryDirectory(prefix=f"industrial-engine-{job.id}-") as temp_dir:
        workdir = Path(temp_dir)
        try:
            provider_holder: dict[str, ProviderBundle] = {}

            def validate_environment() -> dict[str, Any]:
                providers = provider_factory(settings)
                provider_holder["providers"] = providers
                return _validate_environment(session, settings, providers, store)

            _run_stage(session, job, "validate_environment", validate_environment)
            context["providers"] = provider_holder["providers"]

            _materialize_inputs(session, store, job.id, workdir / "inputs")
            _run_stage(session, job, "generate_factory_scene_description_with_codex_oauth", lambda: _stage_scene(context))
            _run_stage(session, job, "generate_reference_image_prompt_with_codex_oauth", lambda: _stage_reference_prompt(context))
            _run_stage(session, job, "create_world_with_world_labs_marble", lambda: _stage_world(context, workdir))
            _run_stage(session, job, "prepare_metric_world_asset", lambda: _stage_metric_world(context, workdir))
            _run_stage(session, job, "generate_initial_camera_poses", lambda: _stage_initial_camera_poses(context, workdir))
            _run_stage(session, job, "render_rgb_depth_with_gsplat", lambda: _stage_render(context, workdir, "initial"))
            _run_stage(session, job, "run_boxer_annotation", lambda: _stage_boxer(context, workdir, "initial"))
            _run_stage(session, job, "distance_aware_refinement", lambda: _stage_refinement(context, workdir))
            _run_stage(session, job, "plan_extra_observation_views", lambda: _stage_extra_views(context, workdir))
            _run_stage(session, job, "render_extra_observations", lambda: _stage_render(context, workdir, "extra"))
            _run_stage(session, job, "rerun_boxer_and_fuse", lambda: _stage_boxer(context, workdir, "final"))
            _run_stage(session, job, "generate_industrial_incidents_with_codex_oauth", lambda: _stage_incidents(context))
            _run_stage(session, job, "generate_inspection_tasks_with_codex_oauth", lambda: _stage_tasks(context))
            _run_stage(session, job, "render_dataset_samples", lambda: _stage_samples(context))
            _run_stage(session, job, "quality_judge_with_ollama_qwen_vlm", lambda: _stage_quality(context))
            _run_stage(session, job, "generate_evidence_cards_with_codex_oauth", lambda: _stage_evidence_cards(context))
            _run_stage(session, job, "generate_site_state_json_with_codex_oauth", lambda: _stage_site_state(context))
            exports = _run_stage(session, job, "export_dataset", lambda: _stage_export(context, workdir))

            job.status = "succeeded"
            job.completed_at = _now()
            job.updated_at = job.completed_at
            job.current_stage = "export_dataset"
            job.failure_reason = None
            job.exports_json = exports["exports"]
            job.result_json = {
                "exportCount": len(exports["exports"]),
                "acceptedSampleCount": len(context.get("accepted_samples", [])),
            }
            session.add(job)
            session.commit()
        except Exception as exc:
            job.status = "failed"
            job.failure_reason = str(exc)
            job.completed_at = _now()
            job.updated_at = job.completed_at
            session.add(job)
            session.commit()
            raise


def _run_stage(session: Session, job: IndustrialEngineJob, name: str, operation):
    stage = session.exec(
        select(IndustrialEngineJobStage).where(
            IndustrialEngineJobStage.job_id == job.id,
            IndustrialEngineJobStage.name == name,
        )
    ).one()
    stage.status = "running"
    stage.started_at = stage.started_at or _now()
    stage.reason = None
    job.current_stage = name
    job.updated_at = _now()
    session.add(stage)
    session.add(job)
    session.commit()

    try:
        result = operation() or {}
    except Exception as exc:
        stage.status = "failed"
        stage.reason = str(exc)
        stage.completed_at = _now()
        job.current_stage = name
        job.updated_at = stage.completed_at
        session.add(stage)
        session.add(job)
        session.commit()
        raise

    output = dict(result) if isinstance(result, dict) else {}
    stage.status = output.pop("_stage_status", "succeeded")
    stage.reason = output.pop("_stage_reason", None)
    stage.output_json = output
    stage.completed_at = _now()
    job.updated_at = stage.completed_at
    session.add(stage)
    session.add(job)
    session.commit()
    return output


def _validate_environment(
    session: Session,
    settings: Settings,
    providers: ProviderBundle,
    store: IndustrialArtifactStore,
) -> dict[str, Any]:
    import os

    if os.getenv("OPENAI_API_KEY"):
        logger.info(OPENAI_IGNORED_MESSAGE)

    if hasattr(providers.text, "validate_authentication"):
        providers.text.validate_authentication()
    if hasattr(providers.quality_judge, "validate_model_available"):
        providers.quality_judge.validate_model_available()
    session.exec(text("SELECT 1"))
    store.write_text(job_id="validation", relative_path="industrial_engine_storage_probe.txt", text="ok")
    return {
        "providers": {
            "text": providers.text.__class__.__name__,
            "world": providers.world.__class__.__name__,
            "qualityJudge": providers.quality_judge.__class__.__name__,
            "renderer": providers.renderer.__class__.__name__,
            "annotator": providers.annotator.__class__.__name__,
            "egoPlanner": providers.ego_planner.__class__.__name__ if providers.ego_planner else None,
        },
        "storageProvider": settings.industrial_storage_provider,
        "database": "reachable",
    }


def _stage_scene(context: dict[str, Any]) -> dict[str, Any]:
    job: IndustrialEngineJob = context["job"]
    providers: ProviderBundle = context["providers"]
    request = job.request_json
    settings: Settings = context["settings"]
    prompt = (
        "Generate a structured JSON factory scene for 4WALL Industrial Data Engine. "
        "Use realistic Taiwan SME factory details, no sci-fi, no fantasy, not game-like, not overly clean. "
        "Include inspectable objects, industrial safety risks, equipment anomalies, and camera placement hints. "
        "Keep the JSON concise: 4 to 8 objects, 1 to 3 hazard zones, 2 to 4 camera placement hints, "
        f"and at most {settings.industrial_engine_max_incidents_per_scene} incident design hints.\n\n"
        f"Input:\n{json.dumps(request, ensure_ascii=False)}"
    )
    scene = providers.text.generate_json(purpose="scene_description", prompt=prompt, schema=_scene_schema())
    _validate_scene(scene)
    _write_json(context, "scene/scene_description.json", scene)
    context["scene"] = scene
    return {"artifact": "scene/scene_description.json", "sceneName": scene.get("sceneName")}


def _stage_reference_prompt(context: dict[str, Any]) -> dict[str, Any]:
    providers: ProviderBundle = context["providers"]
    scene = context["scene"]
    prompt = (
        "Generate a rigorous reference image prompt for World Labs / Marble text-to-world. "
        "Do not request image generation. Return only JSON.\n\n"
        f"Scene:\n{json.dumps(scene, ensure_ascii=False)}"
    )
    reference = providers.text.generate_json(purpose="reference_prompt", prompt=prompt, schema=_reference_prompt_schema())
    _write_json(context, "scene/reference_image_prompt.json", reference)
    context["reference_prompt"] = reference
    return {"artifact": "scene/reference_image_prompt.json", "style": reference.get("style")}


def _stage_world(context: dict[str, Any], workdir: Path) -> dict[str, Any]:
    job: IndustrialEngineJob = context["job"]
    providers: ProviderBundle = context["providers"]
    input_paths = sorted((workdir / "inputs").glob("*"))
    world = providers.world.create_world(
        mode=job.mode,
        display_name=context["scene"].get("sceneName") or f"industrial-engine-{job.id}",
        scene_description=context["scene"],
        reference_prompt=context["reference_prompt"],
        input_image_paths=input_paths,
    )
    spz_payload = world.pop("spz_bytes", None)
    if not spz_payload:
        raise IndustrialProviderError("world_spz_bytes_missing")
    spz_bytes = base64.b64decode(spz_payload)
    world_asset_key = context["store"].write_bytes(
        job_id=job.id,
        relative_path="world/world_asset.spz",
        data=spz_bytes,
        content_type="model/vnd.spz",
    )
    _write_json(context, "world/world_response.json", world)
    context["world"] = world
    context["world_asset_key"] = world_asset_key
    return {
        "generatedWorldId": world.get("world_id"),
        "worldAssetKey": world_asset_key,
        "panoramaUrl": world.get("panorama_url"),
    }


def _stage_metric_world(context: dict[str, Any], workdir: Path) -> dict[str, Any]:
    metadata = context["world"].get("semantics_metadata") or {}
    metric = {
        "metric_scale_factor": metadata.get("metric_scale_factor"),
        "ground_plane_offset": metadata.get("ground_plane_offset"),
        "coordinate_system": "worldlabs_spz_metric_y_down_up",
        "conversion_formula": "scaled = xyz * metric_scale_factor; scaled[..., 1] -= ground_plane_offset; renderer treats world_up_axis as [0, -1, 0]",
        "world_up_axis": [0, -1, 0],
        "generated_world_id": context["world"].get("world_id"),
        "world_asset_path": "world/world_asset.spz",
    }
    path = workdir / "world_metric_metadata.json"
    path.write_text(json.dumps(metric, ensure_ascii=False, indent=2), encoding="utf-8")
    _write_json(context, "world/world_metric_metadata.json", metric)
    context["metric_metadata_path"] = path
    context["metric_metadata"] = metric
    return {"artifact": "world/world_metric_metadata.json", "generatedWorldId": metric["generated_world_id"]}


def _stage_initial_camera_poses(context: dict[str, Any], workdir: Path) -> dict[str, Any]:
    job: IndustrialEngineJob = context["job"]
    settings: Settings = context["settings"]
    modes = set(job.request_json.get("cameraModes") or [])
    poses = _camera_poses("initial", modes, limit=settings.industrial_engine_max_camera_poses)
    path = workdir / "initial_camera_poses.json"
    path.write_text(json.dumps({"poses": poses}, ensure_ascii=False, indent=2), encoding="utf-8")
    _write_json(context, "camera_poses/initial_camera_poses.json", {"poses": poses})
    context["initial_camera_poses_path"] = path
    return {"artifact": "camera_poses/initial_camera_poses.json", "poseCount": len(poses)}


def _stage_render(context: dict[str, Any], workdir: Path, pass_name: str) -> dict[str, Any]:
    providers: ProviderBundle = context["providers"]
    store: IndustrialArtifactStore = context["store"]
    job: IndustrialEngineJob = context["job"]
    world_spz = store.materialize(key=context["world_asset_key"], path=workdir / "world_asset.spz")
    camera_poses = context["initial_camera_poses_path"] if pass_name == "initial" else context["extra_camera_poses_path"]
    out = workdir / f"{pass_name}_render"
    providers.renderer.render(
        world_spz=world_spz,
        metric_metadata=context["metric_metadata_path"],
        camera_poses=camera_poses,
        output_dir=out,
    )
    uploaded = _upload_tree(store, job.id, out, f"renders/{pass_name}")
    context[f"{pass_name}_render_dir"] = out
    return {"artifactPrefix": f"renders/{pass_name}", "files": uploaded}


def _stage_boxer(context: dict[str, Any], workdir: Path, pass_name: str) -> dict[str, Any]:
    providers: ProviderBundle = context["providers"]
    job: IndustrialEngineJob = context["job"]
    render_dir = context["initial_render_dir"] if pass_name == "initial" else context["extra_render_dir"]
    output = workdir / f"{pass_name}_boxer"
    vocabulary = workdir / "industrial_vocabulary.txt"
    vocabulary.write_text("\n".join(INDUSTRIAL_VOCABULARY), encoding="utf-8")
    camera_poses = context["initial_camera_poses_path"] if pass_name == "initial" else context["extra_camera_poses_path"]
    providers.annotator.annotate(
        rgb_dir=render_dir / "rgb",
        depth_dir=render_dir / "depth",
        camera_poses=camera_poses,
        vocabulary_path=vocabulary,
        output_dir=output,
    )
    uploaded = _upload_tree(context["store"], job.id, output, f"annotations/{pass_name}")
    context[f"{pass_name}_annotation_dir"] = output
    if pass_name == "final":
        final_graph = _read_json(output / "final_scene_graph.json") or _read_json(output / "object_annotations_3d.json") or {}
        if not _annotation_objects(final_graph):
            raise IndustrialProviderError("final_boxer_no_objects_detected")
        context["final_scene_graph"] = final_graph
    else:
        context["initial_annotations"] = _read_json(output / "object_annotations_3d.json") or {}
    return {"artifactPrefix": f"annotations/{pass_name}", "files": uploaded}


def _stage_refinement(context: dict[str, Any], workdir: Path) -> dict[str, Any]:
    annotations = context.get("initial_annotations") or {}
    objects = annotations.get("objects") or annotations.get("annotations") or []
    targets = [
        item
        for item in objects
        if str(item.get("label") or item.get("category") or "").lower().replace(" ", "_") in PRIORITY_REFINEMENT_LABELS
    ]
    payload = {"targets": targets[:12]}
    path = workdir / "extra_observation_targets.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    _write_json(context, "camera_poses/extra_observation_targets.json", payload)
    context["extra_targets"] = payload
    return {"artifact": "camera_poses/extra_observation_targets.json", "targetCount": len(payload["targets"])}


def _stage_extra_views(context: dict[str, Any], workdir: Path) -> dict[str, Any]:
    job: IndustrialEngineJob = context["job"]
    settings: Settings = context["settings"]
    providers: ProviderBundle = context["providers"]
    modes = set(job.request_json.get("cameraModes") or [])
    poses = _camera_poses("extra", modes, limit=min(settings.industrial_engine_max_camera_poses, 24))
    if settings.enable_ego_planner:
        if providers.ego_planner is None:
            raise IndustrialProviderError("ego_planner_provider_missing")
        drone_output = providers.ego_planner.plan(camera_poses=context["initial_camera_poses_path"], output_dir=workdir / "ego_planner")
        drone_status = "planned"
        drone_reason = None
    else:
        drone_output = None
        drone_status = "skipped"
        drone_reason = "ENABLE_EGO_PLANNER=false"
    payload = {
        "poses": poses,
        "inspectionPaths": {
            "fixed_camera": "suggested_positions",
            "amr_camera": "aisle_astar_path",
            "drone_camera": {"status": drone_status, "reason": drone_reason, "output": drone_output},
            "phone_camera": "manual_inspection_points",
            "robot_dog_camera": "low_height_path",
        },
    }
    pose_path = workdir / "extra_camera_poses.json"
    pose_path.write_text(json.dumps({"poses": poses}, ensure_ascii=False, indent=2), encoding="utf-8")
    _write_json(context, "camera_poses/extra_camera_poses.json", {"poses": poses})
    _write_json(context, "camera_poses/inspection_paths.json", payload["inspectionPaths"])
    context["extra_camera_poses_path"] = pose_path
    return {
        "artifact": "camera_poses/extra_camera_poses.json",
        "poseCount": len(poses),
        "dronePlanning": payload["inspectionPaths"]["drone_camera"],
    }


def _stage_incidents(context: dict[str, Any]) -> dict[str, Any]:
    providers: ProviderBundle = context["providers"]
    settings: Settings = context["settings"]
    max_incidents = max(1, settings.industrial_engine_max_incidents_per_scene)
    prompt = (
        f"Generate at most {max_incidents} industrial incident scenario(s) based only on objects present in the final scene graph. "
        "Do not invent forklift or control-panel incidents unless those objects exist. Return JSON.\n\n"
        f"Scene graph:\n{json.dumps(context.get('final_scene_graph') or {}, ensure_ascii=False)}"
    )
    incidents = providers.text.generate_json(purpose="incidents", prompt=prompt, schema=_incidents_schema(max_incidents))
    _validate_incidents(incidents, max_incidents=max_incidents)
    _write_json(context, "incidents/incidents.json", incidents)
    context["incidents"] = incidents
    return {"artifact": "incidents/incidents.json", "incidentCount": len(incidents.get("incidents", []))}


def _stage_tasks(context: dict[str, Any]) -> dict[str, Any]:
    providers: ProviderBundle = context["providers"]
    incidents = context.get("incidents", {}).get("incidents") or []
    max_tasks = max(1, len(incidents) * 3)
    prompt = (
        "For each incident, generate exactly three concise inspection tasks: one object-centered, "
        "one relative-positioned, and one appearance/state-centered. "
        f"Return at most {max_tasks} tasks total as JSON.\n\n"
        f"Incidents:\n{json.dumps(context.get('incidents') or {}, ensure_ascii=False)}"
    )
    tasks = providers.text.generate_json(purpose="inspection_tasks", prompt=prompt, schema=_tasks_schema(max_tasks))
    _validate_tasks(tasks, max_tasks=max_tasks)
    _write_json(context, "tasks/inspection_tasks.json", tasks)
    context["tasks"] = tasks
    return {"artifact": "tasks/inspection_tasks.json", "taskCount": len(tasks.get("tasks", []))}


def _stage_samples(context: dict[str, Any]) -> dict[str, Any]:
    tasks = context.get("tasks", {}).get("tasks", [])
    incidents = context.get("incidents", {}).get("incidents", [])
    if not tasks:
        raise IndustrialProviderError("inspection_tasks_empty_for_dataset_samples")
    rgb_paths = sorted((context["initial_render_dir"] / "rgb").glob("*.png")) + sorted(
        (context["extra_render_dir"] / "rgb").glob("*.png")
    )
    depth_paths = sorted((context["initial_render_dir"] / "depth").glob("*")) + sorted(
        (context["extra_render_dir"] / "depth").glob("*")
    )
    if not rgb_paths or not depth_paths:
        raise IndustrialProviderError("rendered_frames_missing_for_dataset_samples")
    samples = []
    for index, task in enumerate(tasks):
        incident = incidents[index % len(incidents)] if incidents else {}
        rgb_artifacts = [_render_artifact_path(context, path) for path in rgb_paths[:3]]
        depth_artifacts = [_render_artifact_path(context, path) for path in depth_paths[:3]]
        samples.append(
            {
                "sample_id": f"sample_{index + 1:04d}",
                "task_instruction": task.get("instruction") or task.get("task_instruction") or "",
                "rgb_frame_paths": rgb_artifacts,
                "depth_map_paths": depth_artifacts,
                "_local_rgb_frame_paths": [str(path) for path in rgb_paths[:3]],
                "_local_depth_map_paths": [str(path) for path in depth_paths[:3]],
                "camera_poses": "camera_poses/initial_camera_poses.json",
                "object_annotations_2d": "annotations/final/object_annotations_raw.json",
                "object_annotations_3d": "annotations/final/object_annotations_3d.json",
                "incident": incident,
                "expected_answer": task.get("expectedAnswer") or task.get("expected_answer") or "",
                "evidence_card_draft": task.get("evidenceCardDraft") or {},
                "site_state_delta": task.get("siteStateDelta") or {},
            }
        )
    _write_text(context, "samples/dataset_samples_raw.jsonl", _jsonl(_exportable_samples(samples)), "application/x-ndjson")
    context["samples"] = samples
    return {"artifact": "samples/dataset_samples_raw.jsonl", "sampleCount": len(samples)}


def _stage_quality(context: dict[str, Any]) -> dict[str, Any]:
    providers: ProviderBundle = context["providers"]
    threshold = float(context["job"].request_json.get("qualityThreshold") or 0.7)
    samples = context.get("samples", [])
    if not samples:
        raise IndustrialProviderError("dataset_samples_empty_for_quality")
    judgements = []
    accepted = []
    rejected = []
    for sample in samples:
        image_paths = [Path(path) for path in sample.get("_local_rgb_frame_paths", [])[:3]]
        judgement = providers.quality_judge.judge_sample(sample=sample, image_paths=image_paths, schema=_quality_schema())
        judgements.append(judgement)
        score = float(judgement.get("qualityScore") or 0)
        decision = judgement.get("decision") or ("accept" if score >= threshold else "reject")
        (accepted if decision == "accept" and score >= threshold else rejected).append(sample)
    _write_json(context, "quality/quality_judgement.json", {"judgements": judgements, "qualityThreshold": threshold})
    accepted_exportable = _exportable_samples(accepted)
    rejected_exportable = _exportable_samples(rejected)
    _write_text(context, "quality/dataset_samples_accepted.jsonl", _jsonl(accepted_exportable), "application/x-ndjson")
    _write_text(context, "quality/dataset_samples_rejected.jsonl", _jsonl(rejected_exportable), "application/x-ndjson")
    if not accepted:
        raise IndustrialProviderError("quality_judge_rejected_all_samples")
    context["accepted_samples"] = accepted_exportable
    context["quality_judgements"] = judgements
    return {"acceptedCount": len(accepted), "rejectedCount": len(rejected), "artifact": "quality/quality_judgement.json"}


def _stage_evidence_cards(context: dict[str, Any]) -> dict[str, Any]:
    providers: ProviderBundle = context["providers"]
    prompt = (
        "Generate Evidence Cards from accepted samples and quality judgements. Return JSON.\n\n"
        f"Accepted samples:\n{json.dumps(context.get('accepted_samples') or [], ensure_ascii=False)}\n\n"
        f"Quality:\n{json.dumps(context.get('quality_judgements') or [], ensure_ascii=False)}"
    )
    cards = providers.text.generate_json(purpose="evidence_cards", prompt=prompt, schema=_evidence_cards_schema())
    _validate_evidence_cards(cards)
    _write_json(context, "evidence/evidence_cards.json", cards)
    context["evidence_cards"] = cards
    return {"artifact": "evidence/evidence_cards.json", "evidenceCardCount": len(cards.get("evidenceCards", []))}


def _stage_site_state(context: dict[str, Any]) -> dict[str, Any]:
    providers: ProviderBundle = context["providers"]
    prompt = (
        "Generate 4WALL SiteState JSON from scene graph, incidents, accepted samples, and Evidence Cards. Return JSON.\n\n"
        f"Scene graph:\n{json.dumps(context.get('final_scene_graph') or {}, ensure_ascii=False)}\n"
        f"Incidents:\n{json.dumps(context.get('incidents') or {}, ensure_ascii=False)}\n"
        f"Evidence:\n{json.dumps(context.get('evidence_cards') or {}, ensure_ascii=False)}"
    )
    site_state = providers.text.generate_json(purpose="site_state", prompt=prompt, schema=_site_state_schema())
    _validate_site_state(site_state)
    _write_json(context, "site_state/site_state.json", site_state)
    context["site_state"] = site_state
    return {"artifact": "site_state/site_state.json"}


def _stage_export(context: dict[str, Any], workdir: Path) -> dict[str, Any]:
    job: IndustrialEngineJob = context["job"]
    store: IndustrialArtifactStore = context["store"]
    exports = []
    mapping = {
        "dataset.jsonl": "quality/dataset_samples_accepted.jsonl",
        "coco_annotations.json": "exports/coco_annotations.json",
        "object_annotations_3d.json": "annotations/final/object_annotations_3d.json",
        "scene_graph.json": "annotations/final/final_scene_graph.json",
        "incidents.json": "incidents/incidents.json",
        "inspection_tasks.json": "tasks/inspection_tasks.json",
        "evidence_cards.json": "evidence/evidence_cards.json",
        "site_state.json": "site_state/site_state.json",
        "metadata.json": "exports/metadata.json",
        "quality_report.json": "quality/quality_judgement.json",
        "world_asset.spz": "world/world_asset.spz",
    }
    _write_json(context, "exports/coco_annotations.json", {"images": [], "annotations": [], "categories": []})
    _write_json(
        context,
        "exports/metadata.json",
        {
            "jobId": job.id,
            "mode": job.mode,
            "generatedWorldId": context.get("world", {}).get("world_id"),
            "providers": ["Codex OAuth / ChatGPT", "World Labs / Marble", "Ollama Qwen-VL", "gsplat", "Boxer"],
        },
    )
    rgb_zip = _zip_dir(workdir, context["initial_render_dir"] / "rgb", "rgb_frames.zip")
    depth_zip = _zip_dir(workdir, context["initial_render_dir"] / "depth", "depth_maps.zip")
    rgb_zip_data = rgb_zip.read_bytes()
    depth_zip_data = depth_zip.read_bytes()
    rgb_zip_key = store.write_bytes(
        job_id=job.id,
        relative_path="exports/rgb_frames.zip",
        data=rgb_zip_data,
        content_type="application/zip",
    )
    depth_zip_key = store.write_bytes(
        job_id=job.id,
        relative_path="exports/depth_maps.zip",
        data=depth_zip_data,
        content_type="application/zip",
    )

    for artifact_name, source_relative in mapping.items():
        source_key = store.key(job.id, source_relative)
        data = store.read_bytes(source_key)
        if data is None:
            raise IndustrialProviderError(f"export_source_missing:{source_relative}")
        export_key = store.write_bytes(
            job_id=job.id,
            relative_path=f"exports/{artifact_name}",
            data=data,
            content_type=_content_type(artifact_name),
        )
        exports.append(_export_descriptor(job.id, artifact_name, export_key, len(data)))
    exports.append(_export_descriptor(job.id, "rgb_frames.zip", rgb_zip_key, len(rgb_zip_data)))
    exports.append(_export_descriptor(job.id, "depth_maps.zip", depth_zip_key, len(depth_zip_data)))
    return {"exports": exports}


def _materialize_inputs(session: Session, store: IndustrialArtifactStore, job_id: str, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    inputs = session.exec(select(IndustrialEngineInputAsset).where(IndustrialEngineInputAsset.job_id == job_id)).all()
    for asset in inputs:
        store.materialize(key=asset.storage_key, path=output_dir / asset.file_name)


def _write_json(context: dict[str, Any], relative_path: str, payload: dict[str, Any]) -> str:
    return context["store"].write_text(
        job_id=context["job"].id,
        relative_path=relative_path,
        text=json.dumps(payload, ensure_ascii=False, indent=2),
        content_type="application/json",
    )


def _write_text(context: dict[str, Any], relative_path: str, text: str, content_type: str) -> str:
    return context["store"].write_text(job_id=context["job"].id, relative_path=relative_path, text=text, content_type=content_type)


def _upload_tree(store: IndustrialArtifactStore, job_id: str, root: Path, prefix: str) -> list[str]:
    if not root.exists():
        raise IndustrialProviderError(f"output_directory_missing:{root}")
    keys = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(root).as_posix()
        key = store.write_bytes(
            job_id=job_id,
            relative_path=f"{prefix}/{relative}",
            data=path.read_bytes(),
            content_type=_content_type(path.name),
        )
        keys.append(key)
    if not keys:
        raise IndustrialProviderError(f"output_directory_empty:{root}")
    return keys


def _zip_dir(workdir: Path, source_dir: Path, name: str) -> Path:
    if not source_dir.exists():
        raise IndustrialProviderError(f"zip_source_missing:{source_dir}")
    output = workdir / name
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for path in source_dir.rglob("*"):
            if path.is_file():
                archive.write(path, path.relative_to(source_dir).as_posix())
    return output


def _camera_poses(pass_name: str, modes: set[str], limit: int) -> list[dict[str, Any]]:
    if limit <= 0:
        return []
    requested = modes or {"fixed_camera", "amr_camera", "drone_camera", "phone_camera"}
    mode_specs = [
        ("fixed_camera", "fixed_panorama_inspection", 3.2, -10.0),
        ("phone_camera", "phone_handheld_inspection", 1.6, -8.0),
        ("amr_camera", "amr_aisle_inspection", 0.8, -6.0),
        ("robot_dog_camera", "robot_dog_low_height_inspection", 0.55, -4.0),
        ("drone_camera", "drone_overhead_indoor_safe", 4.2, -18.0),
    ]
    selected_specs = [spec for spec in mode_specs if spec[0] in requested]
    if not selected_specs:
        return []

    poses = []
    yaw_step = 360.0 / float(limit)
    yaw_offset = yaw_step / 2.0 if pass_name == "extra" else 0.0
    for index in range(limit):
        mode, label, height, pitch = selected_specs[index % len(selected_specs)]
        yaw = (yaw_offset + (index * yaw_step)) % 360.0
        poses.append(
            {
                "cameraPoseId": f"{pass_name}_{index + 1:03d}",
                "label": f"{label}_yaw_{int(round(yaw)) % 360:03d}",
                "cameraMode": mode,
                "position": {"x": 0.0, "y": height, "z": 0.0},
                "rotation": {"yawDeg": yaw, "pitchDeg": pitch, "rollDeg": 0},
                "heightMeters": height,
            }
        )
    return poses


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _annotation_objects(payload: dict[str, Any]) -> list[dict[str, Any]]:
    objects = payload.get("objects") or payload.get("annotations") or []
    return [item for item in objects if isinstance(item, dict)]


def _require_items(payload: dict[str, Any], key: str, failure: str) -> list[dict[str, Any]]:
    items = payload.get(key)
    if not isinstance(items, list) or not items:
        raise IndustrialProviderError(failure)
    typed = [item for item in items if isinstance(item, dict)]
    if len(typed) != len(items):
        raise IndustrialProviderError(f"{failure}_invalid_item")
    return typed


def _require_nonempty_fields(item: dict[str, Any], fields: tuple[str, ...], failure: str) -> None:
    missing = [field for field in fields if not str(item.get(field) or "").strip()]
    if missing:
        raise IndustrialProviderError(f"{failure}:{','.join(missing)}")


def _validate_incidents(payload: dict[str, Any], *, max_incidents: int | None = None) -> None:
    incidents = _require_items(payload, "incidents", "industrial_incidents_empty")
    if max_incidents is not None and len(incidents) > max_incidents:
        raise IndustrialProviderError("industrial_incidents_exceed_limit")
    required = ("incidentId", "label", "severity", "objectLabel", "description", "evidenceHint")
    for index, incident in enumerate(incidents):
        _require_nonempty_fields(incident, required, f"industrial_incident_missing_fields:{index}")


def _validate_scene(payload: dict[str, Any]) -> None:
    _require_nonempty_fields(
        payload,
        ("sceneName", "factoryAreaType", "realismStyle", "layoutDescription"),
        "scene_description_missing_fields",
    )
    objects = _require_items(payload, "objects", "scene_description_objects_empty")
    if len(objects) > 12:
        raise IndustrialProviderError("scene_description_objects_excessive")


def _validate_tasks(payload: dict[str, Any], *, max_tasks: int | None = None) -> None:
    tasks = _require_items(payload, "tasks", "inspection_tasks_empty")
    if max_tasks is not None and len(tasks) > max_tasks:
        raise IndustrialProviderError("inspection_tasks_exceed_limit")
    required = ("taskId", "incidentId", "taskType", "instruction", "expectedAnswer")
    for index, task in enumerate(tasks):
        _require_nonempty_fields(task, required, f"inspection_task_missing_fields:{index}")
        if not isinstance(task.get("evidenceCardDraft"), dict):
            raise IndustrialProviderError(f"inspection_task_missing_evidence_card_draft:{index}")
        if not isinstance(task.get("siteStateDelta"), dict):
            raise IndustrialProviderError(f"inspection_task_missing_site_state_delta:{index}")


def _validate_evidence_cards(payload: dict[str, Any]) -> None:
    cards = _require_items(payload, "evidenceCards", "evidence_cards_empty")
    required = ("evidenceCardId", "sampleId", "title", "summary", "observation", "confidence")
    for index, card in enumerate(cards):
        _require_nonempty_fields(card, required, f"evidence_card_missing_fields:{index}")
        frames = card.get("supportingFrames")
        if not isinstance(frames, list) or not frames:
            raise IndustrialProviderError(f"evidence_card_supporting_frames_empty:{index}")


def _validate_site_state(payload: dict[str, Any]) -> None:
    site_state = payload.get("siteState")
    if not isinstance(site_state, dict) or not site_state:
        raise IndustrialProviderError("site_state_empty")
    _require_nonempty_fields(site_state, ("status", "summary"), "site_state_missing_fields")


def _render_artifact_path(context: dict[str, Any], path: Path) -> str:
    for pass_name in ("initial", "extra"):
        render_dir = context.get(f"{pass_name}_render_dir")
        if not isinstance(render_dir, Path):
            continue
        try:
            relative = path.relative_to(render_dir).as_posix()
        except ValueError:
            continue
        return f"renders/{pass_name}/{relative}"
    raise IndustrialProviderError(f"render_path_not_in_uploaded_tree:{path}")


def _exportable_sample(sample: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in sample.items() if not key.startswith("_local_")}


def _exportable_samples(samples: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [_exportable_sample(sample) for sample in samples]


def _jsonl(items: list[dict[str, Any]]) -> str:
    return "\n".join(json.dumps(item, ensure_ascii=False) for item in items) + ("\n" if items else "")


def _content_type(name: str) -> str:
    if name.endswith(".json"):
        return "application/json"
    if name.endswith(".jsonl"):
        return "application/x-ndjson"
    if name.endswith(".png"):
        return "image/png"
    if name.endswith(".zip"):
        return "application/zip"
    if name.endswith(".spz"):
        return "model/vnd.spz"
    return "application/octet-stream"


def _export_descriptor(job_id: str, artifact_name: str, storage_key: str, size_bytes: int) -> dict[str, Any]:
    return {
        "artifactName": artifact_name,
        "storageKey": storage_key,
        "downloadUrl": f"/v1/industrial-data-engine/jobs/{job_id}/exports/{artifact_name}",
        "contentType": _content_type(artifact_name),
        "sizeBytes": size_bytes,
    }


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _scene_schema() -> dict[str, Any]:
    named_item = {
        "type": "object",
        "properties": {
            "label": {"type": "string"},
            "description": {"type": "string"},
        },
        "required": ["label", "description"],
    }
    return {
        "type": "object",
        "properties": {
            "sceneName": {"type": "string"},
            "factoryAreaType": {"type": "string"},
            "realismStyle": {"type": "string"},
            "layoutDescription": {"type": "string"},
            "objects": {"type": "array", "minItems": 4, "maxItems": 8, "items": named_item},
            "hazardZones": {"type": "array", "minItems": 1, "maxItems": 3, "items": named_item},
            "cameraPlacementPlan": {"type": "array", "minItems": 2, "maxItems": 4, "items": named_item},
            "incidentDesignHints": {"type": "array", "minItems": 1, "maxItems": 5, "items": named_item},
        },
        "required": [
            "sceneName",
            "factoryAreaType",
            "realismStyle",
            "layoutDescription",
            "objects",
            "hazardZones",
            "cameraPlacementPlan",
            "incidentDesignHints",
        ],
    }


def _reference_prompt_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "referenceImagePrompt": {"type": "string"},
            "negativePrompt": {"type": "string"},
            "style": {"type": "string"},
        },
        "required": ["referenceImagePrompt", "negativePrompt", "style"],
    }


def _incidents_schema(max_items: int = 5) -> dict[str, Any]:
    item = {
        "type": "object",
        "properties": {
            "incidentId": {"type": "string"},
            "label": {"type": "string"},
            "severity": {"type": "string", "enum": ["low", "medium", "high"]},
            "objectId": {"type": "string"},
            "objectLabel": {"type": "string"},
            "description": {"type": "string"},
            "evidenceHint": {"type": "string"},
        },
        "required": ["incidentId", "label", "severity", "objectLabel", "description", "evidenceHint"],
    }
    return {
        "type": "object",
        "properties": {"incidents": {"type": "array", "minItems": 1, "maxItems": max_items, "items": item}},
        "required": ["incidents"],
    }


def _tasks_schema(max_items: int = 15) -> dict[str, Any]:
    item = {
        "type": "object",
        "properties": {
            "taskId": {"type": "string"},
            "incidentId": {"type": "string"},
            "taskType": {"type": "string", "enum": ["object_centered", "relative_positioned", "appearance_state"]},
            "instruction": {"type": "string"},
            "expectedAnswer": {"type": "string"},
            "evidenceCardDraft": {"type": "object"},
            "siteStateDelta": {"type": "object"},
        },
        "required": [
            "taskId",
            "incidentId",
            "taskType",
            "instruction",
            "expectedAnswer",
            "evidenceCardDraft",
            "siteStateDelta",
        ],
    }
    return {
        "type": "object",
        "properties": {"tasks": {"type": "array", "minItems": 1, "maxItems": max_items, "items": item}},
        "required": ["tasks"],
    }


def _quality_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "sampleId": {"type": "string"},
            "qualityScore": {"type": "number", "minimum": 0, "maximum": 1},
            "visibilityScore": {"type": "number", "minimum": 0, "maximum": 1},
            "annotationConsistencyScore": {"type": "number", "minimum": 0, "maximum": 1},
            "incidentConsistencyScore": {"type": "number", "minimum": 0, "maximum": 1},
            "artifactScore": {"type": "number", "minimum": 0, "maximum": 1},
            "decision": {"type": "string", "enum": ["accept", "reject"]},
            "reason": {"type": "string"},
        },
        "required": [
            "sampleId",
            "qualityScore",
            "visibilityScore",
            "annotationConsistencyScore",
            "incidentConsistencyScore",
            "artifactScore",
            "decision",
            "reason",
        ],
    }


def _evidence_cards_schema() -> dict[str, Any]:
    item = {
        "type": "object",
        "properties": {
            "evidenceCardId": {"type": "string"},
            "sampleId": {"type": "string"},
            "title": {"type": "string"},
            "summary": {"type": "string"},
            "observation": {"type": "string"},
            "confidence": {"type": "string"},
            "supportingFrames": {"type": "array", "items": {"type": "string"}},
        },
        "required": [
            "evidenceCardId",
            "sampleId",
            "title",
            "summary",
            "observation",
            "confidence",
            "supportingFrames",
        ],
    }
    return {
        "type": "object",
        "properties": {"evidenceCards": {"type": "array", "items": item}},
        "required": ["evidenceCards"],
    }


def _site_state_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "siteState": {
                "type": "object",
                "properties": {
                    "status": {"type": "string"},
                    "summary": {"type": "string"},
                    "openIncidentIds": {"type": "array", "items": {"type": "string"}},
                    "evidenceCardIds": {"type": "array", "items": {"type": "string"}},
                    "updatedObjectLabels": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["status", "summary", "openIncidentIds", "evidenceCardIds", "updatedObjectLabels"],
            }
        },
        "required": ["siteState"],
    }
