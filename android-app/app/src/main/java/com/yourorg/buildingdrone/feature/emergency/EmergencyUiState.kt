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
    val nextStep: String = "確認狀態後選擇繼續、RTH 或人工接管。",
    val primaryActionLabel: String = "完成降落",
    val secondaryActionLabel: String = "中止任務",
    val completeLandingEnabled: Boolean = false,
    val abortManualEnabled: Boolean = false
)
