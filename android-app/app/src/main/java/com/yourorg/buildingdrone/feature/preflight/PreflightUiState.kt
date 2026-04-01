package com.yourorg.buildingdrone.feature.preflight

data class PreflightChecklistItem(
    val label: String,
    val passed: Boolean,
    val detail: String
)

data class PreflightUiState(
    val blockers: List<String>,
    val readyToUpload: Boolean,
    val checklist: List<PreflightChecklistItem> = emptyList(),
    val warning: String? = null
)
