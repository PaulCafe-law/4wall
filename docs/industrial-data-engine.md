# 4WALL Industrial Data Engine

## Scope

Industrial Data Engine is a Sprint 3 planner-server and desktop web-app capability. It creates planning and training artifacts for industrial inspection workflows. It is not flight-critical and must not issue real-time flight commands.

The production runtime does not use the OpenAI API, does not require `OPENAI_API_KEY`, and does not use Codex as a production provider. Codex is limited to development, review, QA, security review, and post-run human-assisted inspection.

## Gap Analysis

- Long-running world generation, rendering, annotation, and quality judging cannot run inside API request handlers. The API creates durable jobs; a worker processes queued jobs.
- Provider failures must be visible as job/stage failures. The system must not create fake worlds, fake frames, fake annotations, or fake quality scores.
- Stage 16 quality checking must use Ollama Qwen-VL, not Codex or an OpenAI API provider.
- The API and worker must share database and artifact storage so status polling and export downloads stay consistent.
- Drone path planning is optional. With `ENABLE_EGO_PLANNER=false`, only the drone path planning sub-result is skipped.

## Providers

- `GeminiTextProvider`: scene JSON, reference prompts, incidents, inspection tasks, Evidence Cards, and SiteState JSON.
- `WorldLabsMarbleProvider`: text/image to world generation, operation polling, `.spz` download, panorama, and world metadata.
- `OllamaQwenVLMQualityJudgeProvider`: calls `OLLAMA_BASE_URL/api/chat` with `OLLAMA_QWEN_VLM_MODEL` and structured JSON output.
- `GSplatRendererWorker`: calls `planner-server/scripts/industrial_engine/render_gsplat.py` to render RGB/depth outputs from `.spz`.
- `BoxerAnnotationWorker`: calls `planner-server/scripts/industrial_engine/run_boxer_annotation.py` for 2D and 3D annotations.
- `EGOPlannerWorker`: only created when `ENABLE_EGO_PLANNER=true`; otherwise drone planning is marked skipped.

The gsplat and Boxer wrapper scripts require real command templates:

```env
GSPLAT_RENDER_COMMAND=
BOXER_ANNOTATION_COMMAND=
EGO_PLANNER_COMMAND=
```

If these are missing when the corresponding stage is enabled, the worker fails fast.

## Production Runtime Adapters

The API and web service can run on Render, but the long-running data engine worker should run on an external GPU host when Render does not provide a paid worker/GPU service. That external worker must use the same production database and artifact storage as the API.

As of the first production worker setup, the external worker requirements are:

- Render Postgres external connection string, not the Render internal host.
- Shared S3 artifact storage credentials.
- Local Ollama with `OLLAMA_QWEN_VLM_MODEL=qwen2.5vl:7b`.
- A real gsplat command that converts World Labs `.spz` plus camera poses into `rgb/` and `depth/` directories.
- A real Boxer-compatible command that converts rendered `rgb/`, `depth/`, camera poses, and vocabulary into `object_annotations_raw.json` and `object_annotations_3d.json`.

The adapter commands are production gates. They may not create placeholder frames, placeholder annotations, or synthetic quality scores just to let a job finish.

Boxer has an additional release gate: the public `facebookresearch/boxer` code and the `facebook/boxer` Hugging Face weights are published under `cc-by-nc-4.0`. Any customer-facing or commercial production use needs a compatible license or an approved replacement annotation provider before the stage can be treated as production-ready.

World Labs `.spz` assets are rendered from the panorama origin. Camera poses must therefore cover the panorama yaw range instead of orbiting point-cloud bounds. A production smoke run should use at least `INDUSTRIAL_ENGINE_MAX_CAMERA_POSES=8` so initial views cover 360 degrees in 45-degree increments; lower values are only wiring checks and may legitimately fail at Boxer because visible industrial objects were not sampled.

## Pipeline

Each job records durable stage state so the API can return progress while the worker handles long-running work.

1. `validate_environment`
2. `generate_factory_scene_description_with_gemini`
3. `generate_reference_image_prompt_with_gemini`
4. `create_world_with_world_labs_marble`
5. `prepare_metric_world_asset`
6. `generate_initial_camera_poses`
7. `render_rgb_depth_with_gsplat`
8. `run_boxer_annotation`
9. `distance_aware_refinement`
10. `plan_extra_observation_views`
11. `render_extra_observations`
12. `rerun_boxer_and_fuse`
13. `generate_industrial_incidents_with_gemini`
14. `generate_inspection_tasks_with_gemini`
15. `render_dataset_samples`
16. `quality_judge_with_ollama_qwen_vlm`
17. `generate_evidence_cards_with_gemini`
18. `generate_site_state_json_with_gemini`
19. `export_dataset`

## Failure Policy

Required provider failures are fail-fast:

- `missing_gemini_api_key`
- `missing_worldlabs_api_key`
- `ollama_qwen_vlm_unavailable`
- `ollama_qwen_vlm_model_missing:{model}`
- `missing_boxer_repo_or_checkpoint`
- `missing_boxer_annotation_command`
- `missing_gsplat_python_env`
- `missing_gsplat_render_command`
- `ego_planner_command_not_configured` when EGO-Planner is enabled

If `OPENAI_API_KEY` exists in the environment, the worker only logs:

```text
This project does not use OpenAI API keys. Use ChatGPT OAuth for Codex development login.
```

## API

- `POST /v1/industrial-data-engine/jobs`
- `GET /v1/industrial-data-engine/jobs`
- `GET /v1/industrial-data-engine/jobs/{jobId}`
- `GET /v1/industrial-data-engine/jobs/{jobId}/status`
- `GET /v1/industrial-data-engine/jobs/{jobId}/exports/{artifactName}`

Create job fields:

- `organizationId`
- optional `siteId`
- `mode`: `text_to_world` or `real_factory_photos_to_world`
- `factoryAreaType`
- `incidentTypes`
- `cameraModes`
- `notes`
- optional `qualityThreshold`
- optional multipart `photos[]`

## Artifacts

Local development stores artifacts under:

```text
storage/industrial-data-engine/{jobId}/
```

Expected export artifacts:

- `dataset.jsonl`
- `coco_annotations.json`
- `object_annotations_3d.json`
- `scene_graph.json`
- `incidents.json`
- `inspection_tasks.json`
- `evidence_cards.json`
- `site_state.json`
- `metadata.json`
- `rgb_frames.zip`
- `depth_maps.zip`
- `world_asset.spz`
- `quality_report.json`

Staging and production should use shared artifact storage so the API process and worker process can access the same inputs and outputs.
