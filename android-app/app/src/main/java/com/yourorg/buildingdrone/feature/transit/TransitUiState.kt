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
    val progressLabel: String = "Awaiting mission start",
    val telemetry: List<TelemetryField> = emptyList(),
    val riskReason: String? = null,
    val nextStep: String = "Load a mission bundle and upload mission",
    val partialWarning: String? = null
)
