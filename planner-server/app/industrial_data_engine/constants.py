from __future__ import annotations


JOB_STATUSES = {"queued", "running", "succeeded", "failed"}
JOB_MODES = {"text_to_world", "real_factory_photos_to_world"}
STAGE_STATUSES = {"pending", "running", "succeeded", "failed", "skipped"}

STAGES: tuple[tuple[int, str], ...] = (
    (1, "validate_environment"),
    (2, "generate_factory_scene_description_with_gemini"),
    (3, "generate_reference_image_prompt_with_gemini"),
    (4, "create_world_with_world_labs_marble"),
    (5, "prepare_metric_world_asset"),
    (6, "generate_initial_camera_poses"),
    (7, "render_rgb_depth_with_gsplat"),
    (8, "run_boxer_annotation"),
    (9, "distance_aware_refinement"),
    (10, "plan_extra_observation_views"),
    (11, "render_extra_observations"),
    (12, "rerun_boxer_and_fuse"),
    (13, "generate_industrial_incidents_with_gemini"),
    (14, "generate_inspection_tasks_with_gemini"),
    (15, "render_dataset_samples"),
    (16, "quality_judge_with_ollama_qwen_vlm"),
    (17, "generate_evidence_cards_with_gemini"),
    (18, "generate_site_state_json_with_gemini"),
    (19, "export_dataset"),
)

STAGE_BY_NAME = {name: sequence for sequence, name in STAGES}

INDUSTRIAL_VOCABULARY = (
    "machine",
    "injection molding machine",
    "control panel",
    "screen",
    "warning light",
    "gauge",
    "pipe",
    "pallet",
    "rack",
    "forklift",
    "worker",
    "helmet",
    "safety vest",
    "safety cone",
    "fire extinguisher",
    "electrical box",
    "material stack",
    "oil stain",
    "water puddle",
    "blocked aisle object",
    "emergency exit sign",
    "aisle",
    "danger zone",
)

PRIORITY_REFINEMENT_LABELS = {
    "machine",
    "control_panel",
    "screen",
    "warning_light",
    "worker",
    "forklift",
    "blocked_aisle_object",
    "electrical_box",
}
