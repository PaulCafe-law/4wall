package com.yourorg.buildingdrone.feature.inspection

import com.yourorg.buildingdrone.ui.ScreenDataState

data class InspectionCaptureUiState(
    val viewpointLabel: String,
    val alignmentStatus: String = "Awaiting approach",
    val captureStatus: ScreenDataState = ScreenDataState.EMPTY,
    val framingHints: List<String> = emptyList(),
    val reason: String? = null,
    val captureEnabled: Boolean = false
)
