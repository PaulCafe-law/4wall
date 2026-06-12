from __future__ import annotations

import base64
from dataclasses import replace
import json
from pathlib import Path
import subprocess
import sys

import httpx
import pytest
from sqlmodel import select

from app.config import Settings
from app.industrial_data_engine.constants import STAGES
from app.industrial_data_engine.pipeline import (
    _camera_poses,
    _incidents_schema,
    _scene_schema,
    _tasks_schema,
    run_industrial_engine_job,
)
from app.industrial_data_engine.providers import (
    BoxerAnnotationWorker,
    CodexOAuthTextProvider,
    EGOPlannerWorker,
    GSplatRendererWorker,
    IndustrialProviderError,
    OllamaQwenVLMQualityJudgeProvider,
    ProviderBundle,
    validate_quality_judgement,
)
from app.industrial_data_engine.storage import IndustrialArtifactStore
from app.models import IndustrialEngineJob, IndustrialEngineJobStage
from tests.helpers import login_web, seed_organization, seed_site, seed_user


PASSWORD = "Password123!"


def test_camera_poses_cover_panorama_sweep_for_smoke_limit() -> None:
    poses = _camera_poses("initial", {"fixed_camera", "phone_camera"}, limit=8)

    assert [round(pose["rotation"]["yawDeg"]) for pose in poses] == [0, 45, 90, 135, 180, 225, 270, 315]
    assert {pose["cameraMode"] for pose in poses} == {"fixed_camera", "phone_camera"}


def test_camera_poses_two_pose_limit_uses_opposite_directions() -> None:
    poses = _camera_poses("initial", {"fixed_camera"}, limit=2)

    assert [round(pose["rotation"]["yawDeg"]) for pose in poses] == [0, 180]


def test_extra_camera_poses_interleave_initial_panorama_sweep() -> None:
    poses = _camera_poses("extra", {"fixed_camera"}, limit=8)

    assert [round(pose["rotation"]["yawDeg"], 1) for pose in poses[:2]] == [22.5, 67.5]


def test_customer_admin_can_create_list_and_read_industrial_engine_job(client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Industrial Org")
        org_id = org.id
        site = seed_site(session, organization_id=org_id, name="Factory A")
        site_id = site.id
        seed_user(session, email="engine-admin@test.dev", password=PASSWORD, org_roles=[(org_id, "customer_admin")])
        session.commit()

    headers, _ = login_web(client, email="engine-admin@test.dev", password=PASSWORD)
    response = client.post(
        "/v1/industrial-data-engine/jobs",
        headers=headers,
        data={
            "organizationId": org_id,
            "siteId": site_id,
            "mode": "text_to_world",
            "factoryAreaType": "cnc_cell",
            "incidentTypes": json.dumps(["blocked_aisle"]),
            "cameraModes": json.dumps(["fixed_camera", "phone_camera"]),
            "notes": "day shift scene",
            "qualityThreshold": "0.75",
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "queued"
    assert body["mode"] == "text_to_world"
    assert len(body["stages"]) == len(STAGES)
    assert body["request"]["incidentTypes"] == ["blocked_aisle"]

    list_response = client.get("/v1/industrial-data-engine/jobs", headers=headers)
    detail_response = client.get(f"/v1/industrial-data-engine/jobs/{body['jobId']}", headers=headers)

    assert list_response.status_code == 200, list_response.text
    assert [item["jobId"] for item in list_response.json()] == [body["jobId"]]
    assert detail_response.status_code == 200, detail_response.text
    assert detail_response.json()["jobId"] == body["jobId"]


def test_codex_oauth_text_provider_uses_schema_output_and_sanitized_env(
    monkeypatch, test_settings: Settings
) -> None:
    settings = replace(
        test_settings,
        codex_cli_path="codex",
        codex_text_model="gpt-test",
        codex_text_timeout_seconds=123,
        codex_home="/tmp/codex-home",
    )
    captured: dict[str, object] = {}
    monkeypatch.setenv("OPENAI_API_KEY", "must-not-leak")
    monkeypatch.setenv("CODEX_API_KEY", "must-not-leak")
    monkeypatch.setattr("app.industrial_data_engine.providers.shutil.which", lambda value: "/usr/local/bin/codex")

    def fake_run(command, **kwargs):
        captured["command"] = command
        captured["env"] = kwargs["env"]
        captured["cwd"] = kwargs["cwd"]
        captured["timeout"] = kwargs["timeout"]
        output_path = Path(command[command.index("-o") + 1])
        schema_path = Path(command[command.index("--output-schema") + 1])
        captured["schema"] = json.loads(schema_path.read_text(encoding="utf-8"))
        output_path.write_text('{"name":"ok"}', encoding="utf-8")
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr("app.industrial_data_engine.providers.subprocess.run", fake_run)

    payload = CodexOAuthTextProvider(settings).generate_json(
        purpose="scene_description",
        prompt="Return JSON.",
        schema={"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]},
    )

    assert payload == {"name": "ok"}
    command = captured["command"]
    assert command[:2] == ["/usr/local/bin/codex", "exec"]
    assert "--ephemeral" in command
    assert ["--sandbox", "read-only"] == command[command.index("--sandbox") : command.index("--sandbox") + 2]
    assert "--skip-git-repo-check" in command
    assert ["--model", "gpt-test"] == command[command.index("--model") : command.index("--model") + 2]
    assert captured["schema"]["required"] == ["name"]
    assert captured["timeout"] == 123.0
    env = captured["env"]
    assert "OPENAI_API_KEY" not in env
    assert "CODEX_API_KEY" not in env
    assert env["CODEX_HOME"] == "/tmp/codex-home"


def test_codex_oauth_text_provider_validates_chatgpt_login(monkeypatch, test_settings: Settings) -> None:
    monkeypatch.setattr("app.industrial_data_engine.providers.shutil.which", lambda value: "/usr/local/bin/codex")

    def fake_run(command, **kwargs):
        assert command == ["/usr/local/bin/codex", "login", "status"]
        return subprocess.CompletedProcess(command, 0, "Logged in using ChatGPT", "")

    monkeypatch.setattr("app.industrial_data_engine.providers.subprocess.run", fake_run)

    CodexOAuthTextProvider(test_settings).validate_authentication()


def test_codex_oauth_text_provider_rejects_non_oauth_login(monkeypatch, test_settings: Settings) -> None:
    monkeypatch.setattr("app.industrial_data_engine.providers.shutil.which", lambda value: "/usr/local/bin/codex")
    monkeypatch.setattr(
        "app.industrial_data_engine.providers.subprocess.run",
        lambda command, **kwargs: subprocess.CompletedProcess(command, 0, "Logged in using API key", ""),
    )

    with pytest.raises(IndustrialProviderError, match="codex_oauth_not_authenticated:not_chatgpt_login"):
        CodexOAuthTextProvider(test_settings).validate_authentication()


def test_codex_oauth_text_provider_fails_fast_when_cli_missing(monkeypatch, test_settings: Settings) -> None:
    monkeypatch.setattr("app.industrial_data_engine.providers.shutil.which", lambda value: None)

    with pytest.raises(IndustrialProviderError, match="missing_codex_cli"):
        CodexOAuthTextProvider(replace(test_settings, codex_cli_path="missing-codex"))


def test_codex_oauth_text_provider_fails_on_nonzero_exit(monkeypatch, test_settings: Settings) -> None:
    monkeypatch.setattr("app.industrial_data_engine.providers.shutil.which", lambda value: "/usr/local/bin/codex")
    monkeypatch.setattr(
        "app.industrial_data_engine.providers.subprocess.run",
        lambda command, **kwargs: subprocess.CompletedProcess(command, 1, "", "boom"),
    )

    with pytest.raises(IndustrialProviderError, match="codex_text_generation_failed:scene_description:boom"):
        CodexOAuthTextProvider(test_settings).generate_json(
            purpose="scene_description",
            prompt="Return JSON.",
            schema={"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]},
        )


def test_codex_oauth_text_provider_fails_on_invalid_json(monkeypatch, test_settings: Settings) -> None:
    monkeypatch.setattr("app.industrial_data_engine.providers.shutil.which", lambda value: "/usr/local/bin/codex")

    def fake_run(command, **kwargs):
        Path(command[command.index("-o") + 1]).write_text("not json", encoding="utf-8")
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr("app.industrial_data_engine.providers.subprocess.run", fake_run)

    with pytest.raises(IndustrialProviderError, match="codex_text_generation_failed:scene_description:invalid_json"):
        CodexOAuthTextProvider(test_settings).generate_json(
            purpose="scene_description",
            prompt="Return JSON.",
            schema={"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]},
        )


def test_scene_schema_bounds_generated_arrays() -> None:
    schema = _scene_schema()

    assert schema["properties"]["objects"]["maxItems"] == 8
    assert schema["properties"]["hazardZones"]["maxItems"] == 3
    assert schema["properties"]["cameraPlacementPlan"]["maxItems"] == 4
    assert schema["properties"]["incidentDesignHints"]["maxItems"] == 5


def test_incident_and_task_schemas_bound_generated_arrays() -> None:
    incident_schema = _incidents_schema(1)
    task_schema = _tasks_schema(3)

    assert incident_schema["properties"]["incidents"]["maxItems"] == 1
    assert task_schema["properties"]["tasks"]["maxItems"] == 3


def test_photo_mode_requires_and_stores_uploaded_photos(client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Photo Org")
        org_id = org.id
        seed_user(session, email="photo-admin@test.dev", password=PASSWORD, org_roles=[(org_id, "customer_admin")])
        session.commit()

    headers, _ = login_web(client, email="photo-admin@test.dev", password=PASSWORD)
    missing = client.post(
        "/v1/industrial-data-engine/jobs",
        headers=headers,
        data={
            "organizationId": org_id,
            "mode": "real_factory_photos_to_world",
            "factoryAreaType": "warehouse",
        },
    )
    assert missing.status_code == 422
    assert missing.json()["detail"] == "photos_required_for_real_factory_mode"

    created = client.post(
        "/v1/industrial-data-engine/jobs",
        headers=headers,
        data={
            "organizationId": org_id,
            "mode": "real_factory_photos_to_world",
            "factoryAreaType": "warehouse",
        },
        files=[("photos", ("factory.png", b"image-bytes", "image/png"))],
    )
    assert created.status_code == 200, created.text
    assert created.json()["inputs"][0]["fileName"] == "factory.png"
    assert created.json()["inputs"][0]["sizeBytes"] == len(b"image-bytes")


def test_customer_viewer_cannot_create_industrial_engine_job(client, session_factory) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Viewer Org")
        org_id = org.id
        seed_user(session, email="viewer-engine@test.dev", password=PASSWORD, org_roles=[(org_id, "customer_viewer")])
        session.commit()

    headers, _ = login_web(client, email="viewer-engine@test.dev", password=PASSWORD)
    response = client.post(
        "/v1/industrial-data-engine/jobs",
        headers=headers,
        data={"organizationId": org_id, "mode": "text_to_world", "factoryAreaType": "line"},
    )
    assert response.status_code == 403


def test_industrial_engine_export_download_is_org_scoped(client, session_factory, test_settings: Settings) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Export Org")
        other_org = seed_organization(session, name="Other Org")
        admin = seed_user(session, email="export-admin@test.dev", password=PASSWORD, org_roles=[(org.id, "customer_admin")])
        seed_user(session, email="other-viewer@test.dev", password=PASSWORD, org_roles=[(other_org.id, "customer_admin")])
        job = IndustrialEngineJob(
            organization_id=org.id,
            created_by_user_id=admin.id,
            mode="text_to_world",
            status="succeeded",
            request_json={"mode": "text_to_world"},
        )
        session.add(job)
        session.flush()
        key = IndustrialArtifactStore.from_settings(test_settings).write_bytes(
            job_id=job.id,
            relative_path="exports/dataset.jsonl",
            data=b'{"sample_id":"sample_0001"}\n',
            content_type="application/x-ndjson",
        )
        job.exports_json = [
            {
                "artifactName": "dataset.jsonl",
                "storageKey": key,
                "downloadUrl": f"/v1/industrial-data-engine/jobs/{job.id}/exports/dataset.jsonl",
                "contentType": "application/x-ndjson",
                "sizeBytes": 28,
            }
        ]
        session.add(job)
        session.commit()
        job_id = job.id

    admin_headers, _ = login_web(client, email="export-admin@test.dev", password=PASSWORD)
    other_headers, _ = login_web(client, email="other-viewer@test.dev", password=PASSWORD)

    allowed = client.get(f"/v1/industrial-data-engine/jobs/{job_id}/exports/dataset.jsonl", headers=admin_headers)
    blocked = client.get(f"/v1/industrial-data-engine/jobs/{job_id}/exports/dataset.jsonl", headers=other_headers)

    assert allowed.status_code == 200, allowed.text
    assert allowed.content.startswith(b'{"sample_id"')
    assert blocked.status_code == 403


def test_quality_judgement_schema_validation() -> None:
    validate_quality_judgement(
        {
            "sampleId": "sample_0001",
            "qualityScore": 0.91,
            "visibilityScore": 0.9,
            "annotationConsistencyScore": 0.88,
            "incidentConsistencyScore": 0.87,
            "artifactScore": 0.92,
            "decision": "accept",
            "reason": "grounded",
        }
    )
    with pytest.raises(IndustrialProviderError, match="quality_judgement_invalid_decision"):
        validate_quality_judgement(
            {
                "sampleId": "sample_0001",
                "qualityScore": 0.91,
                "visibilityScore": 0.9,
                "annotationConsistencyScore": 0.88,
                "incidentConsistencyScore": 0.87,
                "artifactScore": 0.92,
                "decision": "maybe",
                "reason": "not allowed",
            }
        )
    with pytest.raises(IndustrialProviderError, match="quality_judgement_score_out_of_range"):
        validate_quality_judgement(
            {
                "sampleId": "sample_0001",
                "qualityScore": 4.5,
                "visibilityScore": 0.9,
                "annotationConsistencyScore": 0.88,
                "incidentConsistencyScore": 0.87,
                "artifactScore": 0.92,
                "decision": "accept",
                "reason": "wrong scale",
            }
        )


def test_ollama_model_missing_fails_fast(monkeypatch, test_settings: Settings) -> None:
    class Response:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"models": [{"name": "llava:latest"}]}

    monkeypatch.setattr("app.industrial_data_engine.providers.httpx.get", lambda *_args, **_kwargs: Response())

    provider = OllamaQwenVLMQualityJudgeProvider(test_settings)
    with pytest.raises(IndustrialProviderError, match="ollama_qwen_vlm_model_missing"):
        provider.validate_model_available()


def test_gsplat_render_command_missing_fails_fast(tmp_path: Path, test_settings: Settings) -> None:
    python_path = tmp_path / "python"
    python_path.write_text("")
    settings = replace(test_settings, gsplat_python_env=str(python_path), gsplat_render_command=None)

    with pytest.raises(IndustrialProviderError, match="missing_gsplat_render_command"):
        GSplatRendererWorker(settings)


def test_boxer_annotation_command_missing_fails_fast(tmp_path: Path, test_settings: Settings) -> None:
    repo_path = tmp_path / "boxer"
    checkpoint_path = tmp_path / "checkpoint.pt"
    repo_path.mkdir()
    checkpoint_path.write_bytes(b"checkpoint")
    settings = replace(
        test_settings,
        boxer_repo_path=str(repo_path),
        boxer_checkpoint_path=str(checkpoint_path),
        boxer_annotation_command=None,
    )

    with pytest.raises(IndustrialProviderError, match="missing_boxer_annotation_command"):
        BoxerAnnotationWorker(settings)


def test_gsplat_renderer_uses_configured_command_template(
    monkeypatch, tmp_path: Path, test_settings: Settings
) -> None:
    captured: dict[str, list[str]] = {}
    output_dir = tmp_path / "rendered"

    def fake_run(command: list[str], **_kwargs) -> subprocess.CompletedProcess:
        captured["command"] = command
        (output_dir / "rgb").mkdir(parents=True)
        (output_dir / "depth").mkdir(parents=True)
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr("app.industrial_data_engine.providers.subprocess.run", fake_run)
    settings = replace(
        test_settings,
        gsplat_python_env=sys.executable,
        gsplat_render_command=(
            "python render_custom.py --world-spz {world_spz} --metric-metadata {metric_metadata} "
            "--camera-poses {camera_poses} --output-dir {output_dir}"
        ),
    )
    world_spz = tmp_path / "world.spz"
    metric = tmp_path / "metric.json"
    poses = tmp_path / "poses.json"
    for path in (world_spz, metric, poses):
        path.write_text("{}", encoding="utf-8")

    GSplatRendererWorker(settings).render(
        world_spz=world_spz,
        metric_metadata=metric,
        camera_poses=poses,
        output_dir=output_dir,
    )

    assert captured["command"][1] == "render_custom.py"
    assert str(world_spz) in captured["command"]
    assert str(output_dir) in captured["command"]


def test_boxer_annotator_uses_configured_command_template(
    monkeypatch, tmp_path: Path, test_settings: Settings
) -> None:
    captured: dict[str, list[str]] = {}
    output_dir = tmp_path / "annotations"

    def fake_run(command: list[str], **_kwargs) -> subprocess.CompletedProcess:
        captured["command"] = command
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "object_annotations_raw.json").write_text("{}", encoding="utf-8")
        (output_dir / "object_annotations_3d.json").write_text("{}", encoding="utf-8")
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr("app.industrial_data_engine.providers.subprocess.run", fake_run)
    repo_path = tmp_path / "boxer"
    checkpoint_path = tmp_path / "checkpoint.pt"
    rgb_dir = tmp_path / "rgb"
    depth_dir = tmp_path / "depth"
    camera_poses = tmp_path / "poses.json"
    vocabulary = tmp_path / "vocabulary.txt"
    for path in (repo_path, rgb_dir, depth_dir):
        path.mkdir()
    checkpoint_path.write_bytes(b"checkpoint")
    camera_poses.write_text("{}", encoding="utf-8")
    vocabulary.write_text("machine", encoding="utf-8")
    settings = replace(
        test_settings,
        boxer_repo_path=str(repo_path),
        boxer_checkpoint_path=str(checkpoint_path),
        boxer_annotation_command=(
            "python annotate_custom.py --boxer-repo {boxer_repo} --checkpoint {checkpoint} "
            "--rgb-dir {rgb_dir} --depth-dir {depth_dir} --camera-poses {camera_poses} "
            "--vocabulary {vocabulary} --output-dir {output_dir}"
        ),
    )

    BoxerAnnotationWorker(settings).annotate(
        rgb_dir=rgb_dir,
        depth_dir=depth_dir,
        camera_poses=camera_poses,
        vocabulary_path=vocabulary,
        output_dir=output_dir,
    )

    assert captured["command"][1] == "annotate_custom.py"
    assert str(repo_path) in captured["command"]
    assert str(output_dir) in captured["command"]


def test_ego_planner_command_missing_fails_fast(tmp_path: Path, test_settings: Settings) -> None:
    workspace_path = tmp_path / "ego"
    workspace_path.mkdir()
    settings = replace(
        test_settings,
        enable_ego_planner=True,
        ego_planner_ros_workspace=str(workspace_path),
        ego_planner_command=None,
    )

    with pytest.raises(IndustrialProviderError, match="ego_planner_command_not_configured"):
        EGOPlannerWorker(settings)


def test_openai_key_is_not_a_runtime_setting(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    settings = Settings.from_env()
    assert not hasattr(settings, "openai_api_key")


def test_full_industrial_engine_pipeline_stage_transitions(client, session_factory, test_settings: Settings) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Pipeline Org")
        user = seed_user(session, email="pipeline@test.dev", password=PASSWORD, org_roles=[(org.id, "customer_admin")])
        job = IndustrialEngineJob(
            organization_id=org.id,
            created_by_user_id=user.id,
            mode="text_to_world",
            request_json={
                "mode": "text_to_world",
                "factoryAreaType": "assembly_line",
                "cameraModes": ["fixed_camera", "phone_camera"],
                "incidentTypes": ["blocked_aisle"],
                "qualityThreshold": 0.5,
            },
        )
        session.add(job)
        session.commit()
        job_id = job.id

        bundle = ProviderBundle(
            text=_FakeTextProvider(),
            world=_FakeWorldProvider(),
            quality_judge=_FakeQualityJudge(),
            renderer=_FakeRenderer(),
            annotator=_FakeAnnotator(),
        )
        run_industrial_engine_job(
            session=session,
            settings=test_settings,
            job_id=job_id,
            provider_factory=lambda _settings: bundle,
        )

        completed = session.get(IndustrialEngineJob, job_id)
        stages = session.exec(
            select(IndustrialEngineJobStage).where(IndustrialEngineJobStage.job_id == job_id)
        ).all()
        exported_dataset = IndustrialArtifactStore.from_settings(test_settings).read_bytes(
            f"{job_id}/exports/dataset.jsonl"
        )
        exported_metadata = IndustrialArtifactStore.from_settings(test_settings).read_bytes(
            f"{job_id}/exports/metadata.json"
        )

    assert completed is not None
    assert completed.status == "succeeded"
    assert completed.current_stage == "export_dataset"
    assert len(completed.exports_json) >= 10
    assert {stage.status for stage in stages} == {"succeeded"}
    assert exported_dataset is not None
    exported_text = exported_dataset.decode("utf-8")
    assert "_local_" not in exported_text
    assert "industrial-engine-" not in exported_text
    assert "renders/initial/rgb/" in exported_text
    assert exported_metadata is not None
    assert "Codex OAuth / ChatGPT" in json.loads(exported_metadata.decode("utf-8"))["providers"]


def test_pipeline_fails_when_final_boxer_outputs_no_objects(
    client, session_factory, test_settings: Settings
) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Empty Annotation Org")
        user = seed_user(session, email="empty-annotation@test.dev", password=PASSWORD, org_roles=[(org.id, "customer_admin")])
        job = IndustrialEngineJob(
            organization_id=org.id,
            created_by_user_id=user.id,
            mode="text_to_world",
            request_json={"mode": "text_to_world", "factoryAreaType": "assembly_line"},
        )
        session.add(job)
        session.commit()
        job_id = job.id

        bundle = ProviderBundle(
            text=_FakeTextProvider(),
            world=_FakeWorldProvider(),
            quality_judge=_FakeQualityJudge(),
            renderer=_FakeRenderer(),
            annotator=_EmptyAnnotator(),
        )

        with pytest.raises(IndustrialProviderError, match="final_boxer_no_objects_detected"):
            run_industrial_engine_job(
                session=session,
                settings=test_settings,
                job_id=job_id,
                provider_factory=lambda _settings: bundle,
            )

        failed = session.get(IndustrialEngineJob, job_id)

    assert failed is not None
    assert failed.status == "failed"
    assert failed.failure_reason == "final_boxer_no_objects_detected"


def test_pipeline_fails_when_codex_incidents_are_empty_objects(
    client, session_factory, test_settings: Settings
) -> None:
    with session_factory() as session:
        org = seed_organization(session, name="Empty Incident Org")
        user = seed_user(session, email="empty-incident@test.dev", password=PASSWORD, org_roles=[(org.id, "customer_admin")])
        job = IndustrialEngineJob(
            organization_id=org.id,
            created_by_user_id=user.id,
            mode="text_to_world",
            request_json={"mode": "text_to_world", "factoryAreaType": "assembly_line"},
        )
        session.add(job)
        session.commit()
        job_id = job.id

        bundle = ProviderBundle(
            text=_EmptyIncidentTextProvider(),
            world=_FakeWorldProvider(),
            quality_judge=_FakeQualityJudge(),
            renderer=_FakeRenderer(),
            annotator=_FakeAnnotator(),
        )

        with pytest.raises(IndustrialProviderError, match="industrial_incident_missing_fields"):
            run_industrial_engine_job(
                session=session,
                settings=test_settings,
                job_id=job_id,
                provider_factory=lambda _settings: bundle,
            )

        failed = session.get(IndustrialEngineJob, job_id)

    assert failed is not None
    assert failed.status == "failed"
    assert failed.current_stage == "generate_industrial_incidents_with_codex_oauth"


class _FakeTextProvider:
    def generate_json(self, *, purpose: str, prompt: str, schema: dict) -> dict:
        if purpose == "scene_description":
            return {
                "sceneName": "Test factory",
                "factoryAreaType": "assembly_line",
                "realismStyle": "realistic",
                "layoutDescription": "one aisle",
                "objects": [{"label": "machine"}],
                "hazardZones": [],
                "cameraPlacementPlan": [],
                "incidentDesignHints": [],
            }
        if purpose == "reference_prompt":
            return {"referenceImagePrompt": "real factory", "negativePrompt": "cartoon", "style": "documentary"}
        if purpose == "incidents":
            return {
                "incidents": [
                    {
                        "incidentId": "incident-1",
                        "label": "blocked aisle",
                        "severity": "medium",
                        "objectId": "obj-1",
                        "objectLabel": "machine",
                        "description": "A machine-side aisle is blocked.",
                        "evidenceHint": "Use the visible machine and nearby floor area.",
                    }
                ]
            }
        if purpose == "inspection_tasks":
            return {
                "tasks": [
                    {
                        "taskId": "task-1",
                        "incidentId": "incident-1",
                        "taskType": "object_centered",
                        "instruction": "Inspect the blocked aisle.",
                        "expectedAnswer": "blocked",
                        "evidenceCardDraft": {"title": "Blocked aisle evidence"},
                        "siteStateDelta": {"incidentId": "incident-1"},
                    }
                ]
            }
        if purpose == "evidence_cards":
            return {
                "evidenceCards": [
                    {
                        "evidenceCardId": "card-1",
                        "sampleId": "sample_0001",
                        "title": "Blocked aisle",
                        "summary": "The sample shows a blocked aisle near the machine.",
                        "observation": "Aisle obstruction is visible.",
                        "confidence": "medium",
                        "supportingFrames": ["initial_001"],
                    }
                ]
            }
        if purpose == "site_state":
            return {
                "siteState": {
                    "status": "ready",
                    "summary": "One medium-severity incident is open.",
                    "openIncidentIds": ["incident-1"],
                    "evidenceCardIds": ["card-1"],
                    "updatedObjectLabels": ["machine"],
                }
            }
        raise AssertionError(f"unexpected purpose:{purpose}")


class _EmptyIncidentTextProvider(_FakeTextProvider):
    def generate_json(self, *, purpose: str, prompt: str, schema: dict) -> dict:
        if purpose == "incidents":
            return {"incidents": [{}]}
        return super().generate_json(purpose=purpose, prompt=prompt, schema=schema)


class _FakeWorldProvider:
    def create_world(self, **_kwargs) -> dict:
        return {
            "world_id": "world-1",
            "world": {"id": "world-1"},
            "spz_bytes": base64.b64encode(b"spz").decode("ascii"),
            "semantics_metadata": {"metric_scale_factor": 1, "ground_plane_offset": 0},
            "panorama_url": "https://example.test/pano.jpg",
        }


class _FakeQualityJudge:
    def validate_model_available(self) -> None:
        return None

    def judge_sample(self, *, sample: dict, image_paths: list[Path], schema: dict) -> dict:
        return {
            "sampleId": sample["sample_id"],
            "qualityScore": 0.9,
            "visibilityScore": 0.9,
            "annotationConsistencyScore": 0.9,
            "incidentConsistencyScore": 0.9,
            "artifactScore": 0.9,
            "decision": "accept",
            "reason": "test fixture",
        }


class _FakeRenderer:
    def render(self, *, world_spz: Path, metric_metadata: Path, camera_poses: Path, output_dir: Path) -> None:
        (output_dir / "rgb").mkdir(parents=True)
        (output_dir / "depth").mkdir(parents=True)
        (output_dir / "rgb" / "frame_0001.png").write_bytes(b"png")
        (output_dir / "depth" / "frame_0001.json").write_text('{"depth": 1}', encoding="utf-8")


class _FakeAnnotator:
    def annotate(
        self,
        *,
        rgb_dir: Path,
        depth_dir: Path,
        camera_poses: Path,
        vocabulary_path: Path,
        output_dir: Path,
    ) -> None:
        output_dir.mkdir(parents=True)
        annotations = {"objects": [{"label": "machine", "id": "obj-1"}]}
        (output_dir / "object_annotations_raw.json").write_text(json.dumps({"annotations": []}), encoding="utf-8")
        (output_dir / "object_annotations_3d.json").write_text(json.dumps(annotations), encoding="utf-8")
        (output_dir / "final_scene_graph.json").write_text(json.dumps(annotations), encoding="utf-8")


class _EmptyAnnotator:
    def annotate(
        self,
        *,
        rgb_dir: Path,
        depth_dir: Path,
        camera_poses: Path,
        vocabulary_path: Path,
        output_dir: Path,
    ) -> None:
        output_dir.mkdir(parents=True)
        annotations = {"objects": [], "annotations": []}
        (output_dir / "object_annotations_raw.json").write_text(json.dumps({"frames": []}), encoding="utf-8")
        (output_dir / "object_annotations_3d.json").write_text(json.dumps(annotations), encoding="utf-8")
        (output_dir / "final_scene_graph.json").write_text(json.dumps(annotations), encoding="utf-8")
