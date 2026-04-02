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
    val nextStep: String = "\u5148\u78ba\u8a8d\u505c\u4f4f\u539f\u56e0\uff0c\u518d\u6c7a\u5b9a Resume / RTH / Takeover",
    val primaryActionLabel: String = "\u5b8c\u6210\u76ee\u524d\u6b65\u9a5f",
    val secondaryActionLabel: String = "\u53d6\u6d88\u4eba\u5de5\u63a5\u7ba1",
    val operatorHint: String = "\u505c\u4f4f\u5f8c\u53ea\u5141\u8a31 Resume / RTH / Takeover \u4e09\u500b\u4e3b\u6c7a\u7b56",
    val primaryActionEnabled: Boolean = false,
    val secondaryActionEnabled: Boolean = false
)
