package com.yourorg.buildingdrone.feature.connection

import com.yourorg.buildingdrone.ui.ScreenDataState

data class ConnectionGuideStep(
    val label: String,
    val passed: Boolean,
    val detail: String
)

data class ConnectionGuideUiState(
    val status: ScreenDataState = ScreenDataState.EMPTY,
    val modeLabel: String = "戶外 / 需 GPS",
    val summary: String = "先確認手機、遙控器、飛機、相機與 DJI 前置條件都已就緒。",
    val warning: String? = null,
    val nextStep: String = "完成直接連線檢查後，再進入起飛前檢查。",
    val blockers: List<String> = emptyList(),
    val checklist: List<ConnectionGuideStep> = emptyList(),
    val retryLabel: String = "重新檢查連線",
    val continueLabel: String = "前往起飛前檢查",
    val canContinueToPreflight: Boolean = false,
    val fallbackNote: String? = null
)
