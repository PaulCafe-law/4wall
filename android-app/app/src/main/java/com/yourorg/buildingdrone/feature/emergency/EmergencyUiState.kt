package com.yourorg.buildingdrone.feature.emergency

enum class EmergencyMode {
    HOLD,
    RTH,
    TAKEOVER,
    INFO
}

data class EmergencyUiState(
    val reason: String,
    val mode: EmergencyMode = EmergencyMode.INFO,
    val nextStep: String = "Monitor system state",
    val primaryActionLabel: String = "Complete Landing",
    val secondaryActionLabel: String = "Abort Manual",
    val completeLandingEnabled: Boolean = false,
    val abortManualEnabled: Boolean = false
)
