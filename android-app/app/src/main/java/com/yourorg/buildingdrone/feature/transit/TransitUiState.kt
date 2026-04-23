package com.yourorg.buildingdrone.feature.transit

import com.yourorg.buildingdrone.ui.ScreenDataState

data class TelemetryField(
    val label: String,
    val value: String,
)

data class TransitUiState(
    val stateLabel: String,
    val emergencyVisible: Boolean,
    val status: ScreenDataState = ScreenDataState.EMPTY,
    val progressLabel: String = "等待進入主航段",
    val telemetry: List<TelemetryField> = emptyList(),
    val riskReason: String? = null,
    val nextStep: String = "先完成起飛前檢查，再決定是否啟動主航段或切換到手動飛行。",
    val partialWarning: String? = null,
    val isCompleted: Boolean = false,
    val isHold: Boolean = false,
)
