package com.yourorg.buildingdrone.feature.preflight

data class PreflightUiState(
    val blockers: List<String>,
    val readyToUpload: Boolean
)
