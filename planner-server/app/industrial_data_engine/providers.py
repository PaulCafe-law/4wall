from __future__ import annotations

from dataclasses import dataclass
import base64
import json
import os
from pathlib import Path
import shutil
import shlex
import subprocess
import tempfile
import time
from typing import Any, Protocol

import httpx

from app.config import Settings


class IndustrialProviderError(RuntimeError):
    pass


WORLDLABS_RECONSTRUCTION_MAX_IMAGES = 8


class TextProvider(Protocol):
    def generate_json(self, *, purpose: str, prompt: str, schema: dict[str, Any]) -> dict[str, Any]: ...


class ImageReferenceProvider(Protocol):
    def validate_authentication(self) -> None: ...

    def generate_reference_image(
        self,
        *,
        job_id: str,
        scene_description: dict[str, Any],
        reference_prompt: dict[str, Any],
        output_dir: Path,
    ) -> dict[str, Any]: ...


class WorldProvider(Protocol):
    def create_world(
        self,
        *,
        mode: str,
        display_name: str,
        scene_description: dict[str, Any],
        reference_prompt: dict[str, Any],
        input_image_paths: list[Path],
        generated_reference_image_path: Path | None = None,
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
    image_reference: ImageReferenceProvider
    world: WorldProvider
    quality_judge: VLMQualityJudgeProvider
    renderer: RendererWorker
    annotator: AnnotationWorker
    ego_planner: PathPlannerWorker | None = None


class CodexOAuthTextProvider:
    def __init__(self, settings: Settings) -> None:
        self.executable = _resolve_executable(settings.codex_cli_path)
        self.model = settings.codex_text_model
        self.timeout = float(settings.codex_text_timeout_seconds)
        self.codex_home = settings.codex_home

    def validate_authentication(self) -> None:
        try:
            result = subprocess.run(
                [self.executable, "login", "status"],
                capture_output=True,
                text=True,
                check=False,
                env=self._env(),
                timeout=min(self.timeout, 30.0),
            )
        except FileNotFoundError as exc:
            raise IndustrialProviderError("missing_codex_cli") from exc
        except subprocess.TimeoutExpired as exc:
            raise IndustrialProviderError("codex_oauth_not_authenticated:login_status_timeout") from exc
        if result.returncode != 0:
            detail = _command_excerpt(result)
            raise IndustrialProviderError(f"codex_oauth_not_authenticated:{detail}")
        status = f"{result.stdout}\n{result.stderr}"
        if "chatgpt" not in status.lower():
            raise IndustrialProviderError("codex_oauth_not_authenticated:not_chatgpt_login")

    def generate_json(self, *, purpose: str, prompt: str, schema: dict[str, Any]) -> dict[str, Any]:
        with tempfile.TemporaryDirectory(prefix=f"codex-text-{purpose}-") as temp_dir:
            run_dir = Path(temp_dir)
            schema_path = run_dir / "schema.json"
            output_path = run_dir / "output.json"
            codex_schema = _codex_output_schema(schema)
            schema_path.write_text(json.dumps(codex_schema, ensure_ascii=False, indent=2), encoding="utf-8")
            command = [
                self.executable,
                "exec",
                "--ephemeral",
                "--sandbox",
                "read-only",
                "--skip-git-repo-check",
                "--output-schema",
                str(schema_path),
                "-o",
                str(output_path),
            ]
            if self.model:
                command.extend(["--model", self.model])
            command.append("-")
            prompt_text = _codex_text_prompt(purpose=purpose, prompt=prompt, schema=codex_schema)
            try:
                result = subprocess.run(
                    command,
                    cwd=run_dir,
                    capture_output=True,
                    input=prompt_text,
                    text=True,
                    check=False,
                    env=self._env(),
                    timeout=self.timeout,
                )
            except FileNotFoundError as exc:
                raise IndustrialProviderError("missing_codex_cli") from exc
            except subprocess.TimeoutExpired as exc:
                raise IndustrialProviderError(f"codex_text_generation_failed:{purpose}:timeout") from exc
            if result.returncode != 0:
                raise IndustrialProviderError(f"codex_text_generation_failed:{purpose}:{_command_excerpt(result)}")
            if not output_path.exists():
                raise IndustrialProviderError(f"codex_text_generation_failed:{purpose}:output_missing")
            try:
                return _loads_json_object(output_path.read_text(encoding="utf-8"))
            except Exception as exc:
                raise IndustrialProviderError(f"codex_text_generation_failed:{purpose}:invalid_json:{exc}") from exc

    def _env(self) -> dict[str, str]:
        env = dict(os.environ)
        env.pop("OPENAI_API_KEY", None)
        env.pop("CODEX_API_KEY", None)
        if self.codex_home:
            env["CODEX_HOME"] = self.codex_home
        return env


class GPTImageOAuthReferenceProvider:
    def __init__(self, settings: Settings) -> None:
        self.command_value = settings.gpt_image_oauth_command
        self.model = settings.gpt_image_oauth_model
        self.timeout = float(settings.gpt_image_oauth_timeout_seconds)
        self.size = settings.gpt_image_oauth_size
        self.output_format = settings.gpt_image_oauth_output_format.lower().lstrip(".")

    def validate_authentication(self) -> None:
        command = self._command_parts()
        try:
            result = subprocess.run(
                [*command, "--health"],
                capture_output=True,
                text=True,
                check=False,
                env=self._env(),
                timeout=min(self.timeout, 60.0),
            )
        except FileNotFoundError as exc:
            raise IndustrialProviderError("missing_gpt_image_oauth_command") from exc
        except subprocess.TimeoutExpired as exc:
            raise IndustrialProviderError("gpt_image_oauth_not_authenticated:health_timeout") from exc
        if result.returncode != 0:
            raise IndustrialProviderError(f"gpt_image_oauth_not_authenticated:{_command_excerpt(result)}")
        try:
            health = _loads_json_object(result.stdout or result.stderr or "{}")
        except Exception as exc:
            raise IndustrialProviderError("gpt_image_oauth_not_authenticated:invalid_health_json") from exc
        if health.get("authenticated") is not True:
            raise IndustrialProviderError("gpt_image_oauth_not_authenticated")

    def generate_reference_image(
        self,
        *,
        job_id: str,
        scene_description: dict[str, Any],
        reference_prompt: dict[str, Any],
        output_dir: Path,
    ) -> dict[str, Any]:
        command = self._command_parts()
        output_dir.mkdir(parents=True, exist_ok=True)
        image_path = output_dir / f"reference_image.{self.output_format}"
        metadata_path = output_dir / "reference_image_metadata.json"
        input_path = output_dir / "reference_image_input.json"
        payload = {
            "model": self.model,
            "purpose": "flymirage_reference_image",
            "jobId": job_id,
            "sceneName": scene_description.get("sceneName") or "",
            "prompt": reference_prompt.get("referenceImagePrompt") or "",
            "negativePrompt": reference_prompt.get("negativePrompt") or "",
            "size": self.size,
            "returnFormat": self.output_format,
        }
        input_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        try:
            result = subprocess.run(
                [
                    *command,
                    "--input",
                    str(input_path),
                    "--output",
                    str(image_path),
                    "--metadata-output",
                    str(metadata_path),
                ],
                cwd=output_dir,
                capture_output=True,
                text=True,
                check=False,
                env=self._env(),
                timeout=self.timeout,
            )
        except FileNotFoundError as exc:
            raise IndustrialProviderError("missing_gpt_image_oauth_command") from exc
        except subprocess.TimeoutExpired as exc:
            raise IndustrialProviderError("gpt_image_generation_failed:timeout") from exc
        if result.returncode != 0:
            raise IndustrialProviderError(f"gpt_image_generation_failed:{_command_excerpt(result)}")
        if not image_path.exists():
            raise IndustrialProviderError("gpt_image_generation_failed:output_missing")
        if not metadata_path.exists():
            raise IndustrialProviderError("gpt_image_generation_failed:metadata_missing")
        try:
            metadata = _loads_json_object(metadata_path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise IndustrialProviderError("gpt_image_generation_failed:invalid_metadata") from exc
        width, height, image_format = _validate_reference_image(image_path)
        return {
            "image_path": image_path,
            "metadata": metadata,
            "width": width,
            "height": height,
            "format": image_format,
            "model": self.model,
            "size": self.size,
        }

    def _command_parts(self) -> list[str]:
        return _resolve_command_parts(self.command_value, missing_error="missing_gpt_image_oauth_command")

    def _env(self) -> dict[str, str]:
        env = dict(os.environ)
        env.pop("OPENAI_API_KEY", None)
        env.pop("CODEX_API_KEY", None)
        return env


class WorldLabsMarbleProvider:
    def __init__(self, settings: Settings) -> None:
        if not settings.worldlabs_api_key:
            raise IndustrialProviderError("missing_worldlabs_api_key")
        self.api_key = settings.worldlabs_api_key
        self.model = settings.worldlabs_model
        self.base_url = "https://api.worldlabs.ai/marble/v1"
        self.timeout = 120.0
        self.operation_timeout = float(settings.worldlabs_operation_timeout_seconds)

    def create_world(
        self,
        *,
        mode: str,
        display_name: str,
        scene_description: dict[str, Any],
        reference_prompt: dict[str, Any],
        input_image_paths: list[Path],
        generated_reference_image_path: Path | None = None,
    ) -> dict[str, Any]:
        if mode == "real_factory_photos_to_world" and not input_image_paths:
            raise IndustrialProviderError("real_factory_photos_to_world_requires_photos")

        text_prompt = _world_text_prompt(scene_description, reference_prompt)
        if mode == "text_to_world":
            if generated_reference_image_path is None:
                raise IndustrialProviderError("text_to_world_requires_reference_image")
            media_id = self._upload_image(generated_reference_image_path)
            world_prompt: dict[str, Any] = {
                "type": "image",
                "image_prompt": {"source": "media_asset", "media_asset_id": media_id},
                "text_prompt": text_prompt,
            }
        else:
            selected_paths = _select_evenly_spaced_paths(
                input_image_paths,
                max_count=WORLDLABS_RECONSTRUCTION_MAX_IMAGES,
            )
            media_assets = [self._upload_image(path) for path in selected_paths]
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
                    "reconstruct_images": True,
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
            "world_prompt_type": world_prompt["type"],
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
        media_id = media_asset.get("id") or media_asset.get("media_asset_id")
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
        _raise_for_status(response, "worldlabs_http_error")
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
        deadline = time.monotonic() + self.operation_timeout
        while time.monotonic() < deadline:
            response = httpx.get(
                f"{self.base_url}/operations/{operation_id}",
                headers={"WLT-Api-Key": self.api_key},
                timeout=self.timeout,
            )
            _raise_for_status(response, "worldlabs_http_error")
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
            "incident consistency, artifacts, and evidence grounding. "
            "All score fields must be floats from 0.0 to 1.0, where 1.0 is best.\n\n"
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
        self.command_template = settings.gsplat_render_command

    def render(self, *, world_spz: Path, metric_metadata: Path, camera_poses: Path, output_dir: Path) -> None:
        output_dir.mkdir(parents=True, exist_ok=True)
        command = _format_command_template(
            self.command_template,
            world_spz=world_spz,
            metric_metadata=metric_metadata,
            camera_poses=camera_poses,
            output_dir=output_dir,
        )
        env = dict(os.environ)
        env["PATH"] = f"{self.python.parent}{os.pathsep}{env.get('PATH', '')}"
        _run_command(command, "gsplat_render_failed", env=env)
        if not (output_dir / "rgb").exists() or not (output_dir / "depth").exists():
            raise IndustrialProviderError("gsplat_render_missing_rgb_or_depth_output")


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
        self.command_template = settings.boxer_annotation_command

    def annotate(
        self,
        *,
        rgb_dir: Path,
        depth_dir: Path,
        camera_poses: Path,
        vocabulary_path: Path,
        output_dir: Path,
    ) -> None:
        output_dir.mkdir(parents=True, exist_ok=True)
        command = _format_command_template(
            self.command_template,
            boxer_repo=self.repo_path,
            checkpoint=self.checkpoint_path,
            rgb_dir=rgb_dir,
            depth_dir=depth_dir,
            camera_poses=camera_poses,
            vocabulary=vocabulary_path,
            output_dir=output_dir,
        )
        _run_command(command, "boxer_annotation_failed")
        if not (output_dir / "object_annotations_raw.json").exists() or not (output_dir / "object_annotations_3d.json").exists():
            raise IndustrialProviderError("boxer_annotation_missing_required_outputs")


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
        text=CodexOAuthTextProvider(settings),
        image_reference=GPTImageOAuthReferenceProvider(settings),
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
            value = float(judgement[key])
        except (TypeError, ValueError) as exc:
            raise IndustrialProviderError(f"quality_judgement_invalid_number:{key}") from exc
        if value < 0.0 or value > 1.0:
            raise IndustrialProviderError(f"quality_judgement_score_out_of_range:{key}")
    if judgement["decision"] not in {"accept", "reject"}:
        raise IndustrialProviderError("quality_judgement_invalid_decision")


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


def _error_excerpt(response: httpx.Response) -> str:
    return response.text.strip().replace("\n", " ")[:500]


def _raise_for_status(response: httpx.Response, failure_prefix: str) -> None:
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = _error_excerpt(response) or exc.response.reason_phrase
        raise IndustrialProviderError(f"{failure_prefix}:{response.status_code}:{detail}") from exc


def _select_evenly_spaced_paths(paths: list[Path], *, max_count: int) -> list[Path]:
    if len(paths) <= max_count:
        return list(paths)
    if max_count <= 1:
        return paths[:max_count]

    last_index = len(paths) - 1
    indexes = [round(index * last_index / (max_count - 1)) for index in range(max_count)]
    deduped: list[int] = []
    for index in indexes:
        if index not in deduped:
            deduped.append(index)

    candidate = 0
    while len(deduped) < max_count and candidate <= last_index:
        if candidate not in deduped:
            deduped.append(candidate)
        candidate += 1

    return [paths[index] for index in sorted(deduped[:max_count])]


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


def _resolve_executable(value: str) -> str:
    resolved = shutil.which(value)
    if resolved:
        return resolved
    path = Path(value)
    if path.is_file():
        return str(path)
    raise IndustrialProviderError("missing_codex_cli")


def _resolve_command_parts(value: str | None, *, missing_error: str) -> list[str]:
    if not value or not value.strip():
        raise IndustrialProviderError(missing_error)
    try:
        parts = shlex.split(value)
    except ValueError as exc:
        raise IndustrialProviderError(missing_error) from exc
    if not parts:
        raise IndustrialProviderError(missing_error)
    executable = shutil.which(parts[0])
    if executable:
        return [executable, *parts[1:]]
    path = Path(parts[0])
    if path.is_file():
        return [str(path), *parts[1:]]
    raise IndustrialProviderError(missing_error)


def _validate_reference_image(path: Path) -> tuple[int, int, str]:
    data = path.read_bytes()
    if not data:
        raise IndustrialProviderError("invalid_reference_image:empty")
    try:
        if data.startswith(b"\x89PNG\r\n\x1a\n"):
            width, height = _png_dimensions(data)
            image_format = "png"
        elif data.startswith(b"\xff\xd8"):
            width, height = _jpeg_dimensions(data)
            image_format = "jpeg"
        else:
            raise IndustrialProviderError("invalid_reference_image:unsupported_format")
    except IndustrialProviderError:
        raise
    except Exception as exc:
        raise IndustrialProviderError("invalid_reference_image:decode_failed") from exc
    if width < 512 or height < 512:
        raise IndustrialProviderError("invalid_reference_image:too_small")
    return width, height, image_format


def _png_dimensions(data: bytes) -> tuple[int, int]:
    if len(data) < 24:
        raise IndustrialProviderError("invalid_reference_image:decode_failed")
    width = int.from_bytes(data[16:20], "big")
    height = int.from_bytes(data[20:24], "big")
    if width <= 0 or height <= 0:
        raise IndustrialProviderError("invalid_reference_image:decode_failed")
    return width, height


def _jpeg_dimensions(data: bytes) -> tuple[int, int]:
    index = 2
    while index + 9 < len(data):
        if data[index] != 0xFF:
            index += 1
            continue
        marker = data[index + 1]
        index += 2
        if marker in {0xD8, 0xD9}:
            continue
        if index + 2 > len(data):
            break
        segment_length = int.from_bytes(data[index : index + 2], "big")
        if segment_length < 2 or index + segment_length > len(data):
            break
        if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
            height = int.from_bytes(data[index + 3 : index + 5], "big")
            width = int.from_bytes(data[index + 5 : index + 7], "big")
            if width <= 0 or height <= 0:
                break
            return width, height
        index += segment_length
    raise IndustrialProviderError("invalid_reference_image:decode_failed")


def _codex_text_prompt(*, purpose: str, prompt: str, schema: dict[str, Any]) -> str:
    return (
        "You are the 4WALL Industrial Data Engine text JSON provider. "
        "Generate only the final JSON object requested by the task. "
        "Do not inspect files, do not run commands, and do not include Markdown. "
        "The final response must satisfy the provided JSON schema.\n\n"
        f"Purpose: {purpose}\n\n"
        f"JSON schema:\n{json.dumps(schema, ensure_ascii=False)}\n\n"
        f"Task:\n{prompt}"
    )


def _codex_output_schema(schema: dict[str, Any]) -> dict[str, Any]:
    def visit(value: Any) -> Any:
        if isinstance(value, dict):
            result = {key: visit(item) for key, item in value.items()}
            if result.get("type") == "object" or "properties" in result:
                properties = result.setdefault("properties", {})
                if isinstance(properties, dict):
                    result["required"] = list(properties)
                result["additionalProperties"] = False
            return result
        if isinstance(value, list):
            return [visit(item) for item in value]
        return value

    return visit(schema)


def _command_excerpt(result: subprocess.CompletedProcess[str]) -> str:
    return (result.stderr.strip() or result.stdout.strip() or "command_failed").replace("\n", " ")[:500]


def _format_command_template(command_template: str, **values: Path) -> list[str]:
    return [
        part.format(**{key: str(value) for key, value in values.items()})
        for part in shlex.split(command_template)
    ]


def _run_command(command: list[str], failure_prefix: str, *, env: dict[str, str] | None = None) -> None:
    result = subprocess.run(command, capture_output=True, text=True, check=False, env=env)
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or str(command)
        raise IndustrialProviderError(f"{failure_prefix}:{detail}")
