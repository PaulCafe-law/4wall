from __future__ import annotations

from dataclasses import dataclass
import base64
import json
from pathlib import Path
import shlex
import subprocess
import sys
import time
from typing import Any, Protocol

import httpx

from app.config import Settings


class IndustrialProviderError(RuntimeError):
    pass


class TextProvider(Protocol):
    def generate_json(self, *, purpose: str, prompt: str, schema: dict[str, Any]) -> dict[str, Any]: ...


class WorldProvider(Protocol):
    def create_world(
        self,
        *,
        mode: str,
        display_name: str,
        scene_description: dict[str, Any],
        reference_prompt: dict[str, Any],
        input_image_paths: list[Path],
    ) -> dict[str, Any]: ...


class VLMQualityJudgeProvider(Protocol):
    def judge_sample(self, *, sample: dict[str, Any], image_paths: list[Path], schema: dict[str, Any]) -> dict[str, Any]: ...


class RendererWorker(Protocol):
    def render(self, *, world_spz: Path, metric_metadata: Path, camera_poses: Path, output_dir: Path) -> None: ...


class AnnotationWorker(Protocol):
    def annotate(
        self,
        *,
        rgb_dir: Path,
        depth_dir: Path,
        camera_poses: Path,
        vocabulary_path: Path,
        output_dir: Path,
    ) -> None: ...


class PathPlannerWorker(Protocol):
    def plan(self, *, camera_poses: Path, output_dir: Path) -> dict[str, Any]: ...


@dataclass
class ProviderBundle:
    text: TextProvider
    world: WorldProvider
    quality_judge: VLMQualityJudgeProvider
    renderer: RendererWorker
    annotator: AnnotationWorker
    ego_planner: PathPlannerWorker | None = None


class GeminiTextProvider:
    def __init__(self, settings: Settings) -> None:
        if not settings.gemini_api_key:
            raise IndustrialProviderError("missing_gemini_api_key")
        self.api_key = settings.gemini_api_key
        self.model = settings.gemini_text_model
        self.timeout = 120.0

    def generate_json(self, *, purpose: str, prompt: str, schema: dict[str, Any]) -> dict[str, Any]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseFormat": {
                    "text": {
                        "mimeType": "application/json",
                        "schema": schema,
                    }
                }
            },
        }
        try:
            response = httpx.post(
                url,
                headers={"x-goog-api-key": self.api_key, "Content-Type": "application/json"},
                json=payload,
                timeout=self.timeout,
            )
            response.raise_for_status()
            body = response.json()
            return _loads_json_object(_extract_gemini_text(body))
        except Exception as exc:
            raise IndustrialProviderError(f"{purpose}_gemini_failed:{exc}") from exc


class WorldLabsMarbleProvider:
    def __init__(self, settings: Settings) -> None:
        if not settings.worldlabs_api_key:
            raise IndustrialProviderError("missing_worldlabs_api_key")
        self.api_key = settings.worldlabs_api_key
        self.model = settings.worldlabs_model
        self.base_url = "https://api.worldlabs.ai/marble/v1"
        self.timeout = 120.0

    def create_world(
        self,
        *,
        mode: str,
        display_name: str,
        scene_description: dict[str, Any],
        reference_prompt: dict[str, Any],
        input_image_paths: list[Path],
    ) -> dict[str, Any]:
        if mode == "real_factory_photos_to_world" and not input_image_paths:
            raise IndustrialProviderError("real_factory_photos_to_world_requires_photos")

        text_prompt = _world_text_prompt(scene_description, reference_prompt)
        if mode == "text_to_world":
            world_prompt: dict[str, Any] = {"type": "text", "text_prompt": text_prompt}
        else:
            media_assets = [self._upload_image(path) for path in input_image_paths]
            if len(media_assets) == 1:
                world_prompt = {
                    "type": "image",
                    "image_prompt": {"source": "media_asset", "media_asset_id": media_assets[0]},
                    "text_prompt": text_prompt,
                }
            else:
                step = max(1, 360 // len(media_assets))
                world_prompt = {
                    "type": "multi-image",
                    "multi_image_prompt": [
                        {
                            "azimuth": index * step,
                            "content": {"source": "media_asset", "media_asset_id": media_id},
                        }
                        for index, media_id in enumerate(media_assets)
                    ],
                    "text_prompt": text_prompt,
                }

        operation = self._post_json(
            "/worlds:generate",
            {"display_name": display_name, "model": self.model, "world_prompt": world_prompt},
        )
        operation_id = operation.get("operation_id") or operation.get("id") or operation.get("name")
        if not operation_id:
            raise IndustrialProviderError("worldlabs_operation_id_missing")
        operation = self._poll_operation(operation_id)
        world = operation.get("response") or self._get_world((operation.get("metadata") or {}).get("world_id"))
        world_id = world.get("id") or world.get("world_id") or (operation.get("metadata") or {}).get("world_id")
        if not world_id:
            raise IndustrialProviderError("worldlabs_world_id_missing")

        assets = world.get("assets") or {}
        splats = assets.get("splats") or {}
        spz_urls = splats.get("spz_urls") or {}
        spz_url = spz_urls.get("full_res") or spz_urls.get("500k")
        if not spz_url:
            raise IndustrialProviderError("worldlabs_spz_url_missing")
        spz_response = httpx.get(spz_url, timeout=self.timeout)
        spz_response.raise_for_status()
        spz_bytes = spz_response.content
        if not spz_bytes:
            raise IndustrialProviderError("worldlabs_spz_download_empty")
        return {
            "world_id": world_id,
            "world": world,
            "spz_bytes": base64.b64encode(spz_bytes).decode("ascii"),
            "semantics_metadata": splats.get("semantics_metadata") or {},
            "panorama_url": (assets.get("imagery") or {}).get("pano_url"),
            "thumbnail_url": assets.get("thumbnail_url"),
            "caption": assets.get("caption"),
        }

    def _upload_image(self, path: Path) -> str:
        if not path.exists():
            raise IndustrialProviderError(f"input_image_missing:{path}")
        extension = path.suffix.lstrip(".").lower() or "jpg"
        prepared = self._post_json(
            "/media-assets:prepare_upload",
            {"file_name": path.name, "kind": "image", "extension": extension},
        )
        media_asset = prepared.get("media_asset") or {}
        upload_info = prepared.get("upload_info") or {}
        upload_url = upload_info.get("upload_url")
        media_id = media_asset.get("id")
        if not upload_url or not media_id:
            raise IndustrialProviderError("worldlabs_media_upload_prepare_failed")
        response = httpx.request(
            upload_info.get("upload_method", "PUT"),
            upload_url,
            headers=upload_info.get("required_headers") or {},
            content=path.read_bytes(),
            timeout=self.timeout,
        )
        response.raise_for_status()
        return media_id

    def _post_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = httpx.post(
            f"{self.base_url}{path}",
            headers={"WLT-Api-Key": self.api_key, "Content-Type": "application/json"},
            json=payload,
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()

    def _get_world(self, world_id: str | None) -> dict[str, Any]:
        if not world_id:
            raise IndustrialProviderError("worldlabs_world_id_missing")
        response = httpx.get(
            f"{self.base_url}/worlds/{world_id}",
            headers={"WLT-Api-Key": self.api_key},
            timeout=self.timeout,
        )
        response.raise_for_status()
        body = response.json()
        return body.get("world") or body

    def _poll_operation(self, operation_id: str) -> dict[str, Any]:
        for _ in range(180):
            response = httpx.get(
                f"{self.base_url}/operations/{operation_id}",
                headers={"WLT-Api-Key": self.api_key},
                timeout=self.timeout,
            )
            response.raise_for_status()
            operation = response.json()
            if operation.get("error"):
                raise IndustrialProviderError(f"worldlabs_operation_failed:{operation['error']}")
            if operation.get("done"):
                return operation
            time.sleep(5)
        raise IndustrialProviderError("worldlabs_operation_timeout")


class OllamaQwenVLMQualityJudgeProvider:
    def __init__(self, settings: Settings) -> None:
        if not settings.ollama_base_url or not settings.ollama_qwen_vlm_model:
            raise IndustrialProviderError("missing_ollama_qwen_vlm_configuration")
        self.base_url = settings.ollama_base_url.rstrip("/")
        self.model = settings.ollama_qwen_vlm_model
        self.timeout = float(settings.ollama_request_timeout_seconds)

    def validate_model_available(self) -> None:
        try:
            response = httpx.get(f"{self.base_url}/api/tags", timeout=self.timeout)
            response.raise_for_status()
            models = {item.get("name") for item in response.json().get("models", [])}
        except Exception as exc:
            raise IndustrialProviderError("ollama_qwen_vlm_unavailable") from exc
        if self.model not in models:
            raise IndustrialProviderError(f"ollama_qwen_vlm_model_missing:{self.model}")

    def judge_sample(self, *, sample: dict[str, Any], image_paths: list[Path], schema: dict[str, Any]) -> dict[str, Any]:
        images = [base64.b64encode(path.read_bytes()).decode("ascii") for path in image_paths if path.exists()]
        if not images:
            raise IndustrialProviderError("ollama_quality_judge_images_missing")
        prompt = (
            "You are the 4WALL Industrial Data Engine quality judge. "
            "Return only JSON matching this JSON schema. Evaluate visibility, annotation consistency, "
            "incident consistency, artifacts, and evidence grounding.\n\n"
            f"Schema:\n{json.dumps(schema, ensure_ascii=True)}\n\n"
            f"Sample:\n{json.dumps(sample, ensure_ascii=False)}"
        )
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt, "images": images}],
            "stream": False,
            "format": schema,
            "options": {"temperature": 0},
        }
        try:
            response = httpx.post(f"{self.base_url}/api/chat", json=payload, timeout=self.timeout)
            response.raise_for_status()
            content = (response.json().get("message") or {}).get("content") or "{}"
            judgement = _loads_json_object(content)
            validate_quality_judgement(judgement)
            return judgement
        except Exception as exc:
            raise IndustrialProviderError(f"ollama_quality_judge_failed:{exc}") from exc


class GSplatRendererWorker:
    def __init__(self, settings: Settings) -> None:
        if not settings.gsplat_python_env:
            raise IndustrialProviderError("missing_gsplat_python_env")
        if not settings.gsplat_render_command:
            raise IndustrialProviderError("missing_gsplat_render_command")
        self.python = _resolve_python(settings.gsplat_python_env)

    def render(self, *, world_spz: Path, metric_metadata: Path, camera_poses: Path, output_dir: Path) -> None:
        script = Path(__file__).resolve().parents[2] / "scripts" / "industrial_engine" / "render_gsplat.py"
        output_dir.mkdir(parents=True, exist_ok=True)
        command = [
            str(self.python),
            str(script),
            "--world-spz",
            str(world_spz),
            "--metric-metadata",
            str(metric_metadata),
            "--camera-poses",
            str(camera_poses),
            "--output-dir",
            str(output_dir),
        ]
        _run_command(command, "gsplat_render_failed")


class BoxerAnnotationWorker:
    def __init__(self, settings: Settings) -> None:
        if not settings.boxer_repo_path or not settings.boxer_checkpoint_path:
            raise IndustrialProviderError("missing_boxer_repo_or_checkpoint")
        if not settings.boxer_annotation_command:
            raise IndustrialProviderError("missing_boxer_annotation_command")
        self.repo_path = Path(settings.boxer_repo_path)
        self.checkpoint_path = Path(settings.boxer_checkpoint_path)
        if not self.repo_path.exists() or not self.checkpoint_path.exists():
            raise IndustrialProviderError("boxer_repo_or_checkpoint_not_found")

    def annotate(
        self,
        *,
        rgb_dir: Path,
        depth_dir: Path,
        camera_poses: Path,
        vocabulary_path: Path,
        output_dir: Path,
    ) -> None:
        script = Path(__file__).resolve().parents[2] / "scripts" / "industrial_engine" / "run_boxer_annotation.py"
        output_dir.mkdir(parents=True, exist_ok=True)
        command = [
            sys.executable,
            str(script),
            "--boxer-repo",
            str(self.repo_path),
            "--checkpoint",
            str(self.checkpoint_path),
            "--rgb-dir",
            str(rgb_dir),
            "--depth-dir",
            str(depth_dir),
            "--camera-poses",
            str(camera_poses),
            "--vocabulary",
            str(vocabulary_path),
            "--output-dir",
            str(output_dir),
        ]
        _run_command(command, "boxer_annotation_failed")


class EGOPlannerWorker:
    def __init__(self, settings: Settings) -> None:
        if not settings.ego_planner_ros_workspace:
            raise IndustrialProviderError("missing_ego_planner_ros_workspace")
        if not settings.ego_planner_command:
            raise IndustrialProviderError("ego_planner_command_not_configured")
        self.workspace = Path(settings.ego_planner_ros_workspace)
        if not self.workspace.exists():
            raise IndustrialProviderError("ego_planner_ros_workspace_not_found")
        self.command_template = settings.ego_planner_command

    def plan(self, *, camera_poses: Path, output_dir: Path) -> dict[str, Any]:
        output_dir.mkdir(parents=True, exist_ok=True)
        command = [
            part.format(camera_poses=str(camera_poses), output_dir=str(output_dir), workspace=str(self.workspace))
            for part in shlex.split(self.command_template)
        ]
        _run_command(command, "ego_planner_failed")
        plan_path = output_dir / "drone_path.json"
        if not plan_path.exists():
            raise IndustrialProviderError("ego_planner_output_missing")
        return {"status": "planned", "artifact": str(plan_path)}


def build_provider_bundle(settings: Settings) -> ProviderBundle:
    return ProviderBundle(
        text=GeminiTextProvider(settings),
        world=WorldLabsMarbleProvider(settings),
        quality_judge=OllamaQwenVLMQualityJudgeProvider(settings),
        renderer=GSplatRendererWorker(settings),
        annotator=BoxerAnnotationWorker(settings),
        ego_planner=EGOPlannerWorker(settings) if settings.enable_ego_planner else None,
    )


def validate_quality_judgement(judgement: dict[str, Any]) -> None:
    required = {
        "sampleId",
        "qualityScore",
        "visibilityScore",
        "annotationConsistencyScore",
        "incidentConsistencyScore",
        "artifactScore",
        "decision",
        "reason",
    }
    missing = sorted(required - set(judgement))
    if missing:
        raise IndustrialProviderError(f"quality_judgement_missing_fields:{','.join(missing)}")
    for key in (
        "qualityScore",
        "visibilityScore",
        "annotationConsistencyScore",
        "incidentConsistencyScore",
        "artifactScore",
    ):
        try:
            float(judgement[key])
        except (TypeError, ValueError) as exc:
            raise IndustrialProviderError(f"quality_judgement_invalid_number:{key}") from exc
    if judgement["decision"] not in {"accept", "reject"}:
        raise IndustrialProviderError("quality_judgement_invalid_decision")


def _extract_gemini_text(body: dict[str, Any]) -> str:
    candidates = body.get("candidates") or []
    if not candidates:
        raise IndustrialProviderError("gemini_candidates_missing")
    parts = ((candidates[0].get("content") or {}).get("parts") or [])
    texts = [part.get("text", "") for part in parts if part.get("text")]
    if not texts:
        raise IndustrialProviderError("gemini_text_missing")
    return "\n".join(texts)


def _loads_json_object(value: str) -> dict[str, Any]:
    try:
        payload = json.loads(value)
    except json.JSONDecodeError:
        start = value.find("{")
        end = value.rfind("}")
        if start < 0 or end < start:
            raise
        payload = json.loads(value[start : end + 1])
    if not isinstance(payload, dict):
        raise IndustrialProviderError("json_object_expected")
    return payload


def _world_text_prompt(scene_description: dict[str, Any], reference_prompt: dict[str, Any]) -> str:
    return "\n\n".join(
        [
            json.dumps(scene_description, ensure_ascii=False),
            reference_prompt.get("referenceImagePrompt", ""),
            reference_prompt.get("negativePrompt", ""),
        ]
    )


def _resolve_python(value: str) -> Path:
    path = Path(value)
    if path.is_file():
        return path
    if path.is_dir():
        windows_python = path / "Scripts" / "python.exe"
        unix_python = path / "bin" / "python"
        if windows_python.exists():
            return windows_python
        if unix_python.exists():
            return unix_python
    raise IndustrialProviderError("gsplat_python_env_not_found")


def _run_command(command: list[str], failure_prefix: str) -> None:
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or str(command)
        raise IndustrialProviderError(f"{failure_prefix}:{detail}")
