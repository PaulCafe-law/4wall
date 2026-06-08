from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest
from sqlmodel import select

from app.config import Settings
from app.industrial_data_engine.constants import STAGES
from app.industrial_data_engine.pipeline import run_industrial_engine_job
from app.industrial_data_engine.providers import (
    IndustrialProviderError,
    OllamaQwenVLMQualityJudgeProvider,
    ProviderBundle,
    validate_quality_judgement,
)
from app.industrial_data_engine.storage import IndustrialArtifactStore
from app.models import IndustrialEngineJob, IndustrialEngineJobStage
from tests.helpers import login_web, seed_organization, seed_site, seed_user


PASSWORD = "Password123!"


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

    assert completed is not None
    assert completed.status == "succeeded"
    assert completed.current_stage == "export_dataset"
    assert len(completed.exports_json) >= 10
    assert {stage.status for stage in stages} == {"succeeded"}


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
            return {"incidents": [{"incidentId": "incident-1", "label": "blocked aisle"}]}
        if purpose == "inspection_tasks":
            return {
                "tasks": [
                    {
                        "instruction": "Inspect the blocked aisle.",
                        "expectedAnswer": "blocked",
                        "evidenceCardDraft": {},
                        "siteStateDelta": {},
                    }
                ]
            }
        if purpose == "evidence_cards":
            return {"evidenceCards": [{"evidenceCardId": "card-1"}]}
        if purpose == "site_state":
            return {"siteState": {"status": "ready"}}
        raise AssertionError(f"unexpected purpose:{purpose}")


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
