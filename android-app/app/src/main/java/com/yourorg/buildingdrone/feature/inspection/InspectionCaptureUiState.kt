package com.yourorg.buildingdrone.feature.inspection

import com.yourorg.buildingdrone.ui.ScreenDataState

data class InspectionCaptureUiState(
    val viewpointLabel: String,
    val alignmentStatus: String = "\u7b49\u5f85\u63a5\u8fd1 inspection viewpoint",
    val captureStatus: ScreenDataState = ScreenDataState.EMPTY,
    val framingHints: List<String> = emptyList(),
    val reason: String? = null,
    val captureEnabled: Boolean = false,
    val nextStep: String = "\u5148\u5c0d\u6b63\u756b\u9762\uff0c\u518d\u57f7\u884c Capture"
)
