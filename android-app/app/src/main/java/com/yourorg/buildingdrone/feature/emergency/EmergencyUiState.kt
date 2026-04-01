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
    val holdEnabled: Boolean = true,
    val rthEnabled: Boolean = true,
    val takeoverEnabled: Boolean = true
)
