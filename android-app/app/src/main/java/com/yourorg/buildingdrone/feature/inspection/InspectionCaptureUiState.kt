package com.yourorg.buildingdrone.feature.inspection

import com.yourorg.buildingdrone.ui.ScreenDataState

data class InspectionCaptureUiState(
    val viewpointLabel: String,
    val alignmentStatus: String = "等待接近巡檢拍攝點",
    val captureStatus: ScreenDataState = ScreenDataState.EMPTY,
    val framingHints: List<String> = emptyList(),
    val reason: String? = null,
    val captureEnabled: Boolean = false,
    val nextStep: String = "先對正畫面，再執行拍攝"
)
