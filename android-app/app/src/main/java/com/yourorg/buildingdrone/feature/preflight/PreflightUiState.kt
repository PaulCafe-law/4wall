package com.yourorg.buildingdrone.feature.preflight

import com.yourorg.buildingdrone.ui.ScreenDataState

data class PreflightChecklistItem(
    val label: String,
    val passed: Boolean,
    val detail: String
)

data class PreflightUiState(
    val status: ScreenDataState = ScreenDataState.EMPTY,
    val blockers: List<String> = emptyList(),
    val readyToUpload: Boolean = false,
    val checklist: List<PreflightChecklistItem> = emptyList(),
    val warning: String? = null,
    val modeLabel: String = "demo",
    val nextStep: String = "\u5b8c\u6210\u6240\u6709 blocking gates \u5f8c\u624d\u80fd\u4e0a\u50b3\u4efb\u52d9",
    val decisionHint: String = "\u4efb\u4f55\u4e0d\u78ba\u5b9a\u90fd\u5148 HOLD\uff0c\u518d\u6c7a\u5b9a Resume / RTH / Takeover"
)
