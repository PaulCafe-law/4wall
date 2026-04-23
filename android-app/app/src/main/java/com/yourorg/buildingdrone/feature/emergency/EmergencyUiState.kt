package com.yourorg.buildingdrone.feature.emergency

import com.yourorg.buildingdrone.ui.ScreenDataState

enum class EmergencyMode {
    HOLD,
    RTH,
    TAKEOVER,
    INFO
}

data class EmergencyUiState(
    val reason: String,
    val status: ScreenDataState = ScreenDataState.EMPTY,
    val mode: EmergencyMode = EmergencyMode.INFO,
    val nextStep: String = "請先確認目前狀態，再決定是否繼續盤旋、確認降落或人工接管。",
    val primaryActionLabel: String = "完成目前步驟",
    val secondaryActionLabel: String = "已安全落地",
    val operatorHint: String = "若無法確認目前狀態是否安全，請先保持 HOLD，再決定是否繼續盤旋、確認降落或人工接管。",
    val primaryActionEnabled: Boolean = false,
    val secondaryActionEnabled: Boolean = false
)
