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
    val progressLabel: String = "等待任務開始",
    val telemetry: List<TelemetryField> = emptyList(),
    val riskReason: String? = null,
    val nextStep: String = "先載入任務包，再上傳任務",
    val partialWarning: String? = null,
    val isCompleted: Boolean = false
)
