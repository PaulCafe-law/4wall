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
    val nextStep: String = "監看系統狀態",
    val primaryActionLabel: String = "完成降落",
    val secondaryActionLabel: String = "中止手動模式",
    val completeLandingEnabled: Boolean = false,
    val abortManualEnabled: Boolean = false
)
