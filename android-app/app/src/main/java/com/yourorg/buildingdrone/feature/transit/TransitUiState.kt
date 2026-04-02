package com.yourorg.buildingdrone.feature.transit

import com.yourorg.buildingdrone.ui.ScreenDataState

data class TelemetryField(
    val label: String,
    val value: String
)

data class TransitUiState(
    val stateLabel: String,
    val emergencyVisible: Boolean,
    val status: ScreenDataState = ScreenDataState.EMPTY,
    val progressLabel: String = "\u7b49\u5f85\u9032\u5165\u4e3b\u822a\u6bb5",
    val telemetry: List<TelemetryField> = emptyList(),
    val riskReason: String? = null,
    val nextStep: String = "\u5148\u5b8c\u6210 preflight\uff0c\u4e26\u78ba\u8a8d\u4efb\u52d9\u5df2\u4e0a\u50b3\u5230 aircraft",
    val partialWarning: String? = null,
    val isCompleted: Boolean = false,
    val isHold: Boolean = false
)
