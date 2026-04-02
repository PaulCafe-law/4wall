package com.yourorg.buildingdrone.feature.branchverify

import com.yourorg.buildingdrone.ui.ScreenDataState

data class BranchVerifyUiState(
    val availableOptions: List<String>,
    val status: ScreenDataState = ScreenDataState.EMPTY,
    val confidenceLabel: String = "等待模型判讀",
    val countdownSeconds: Int = 0,
    val reason: String? = null
)
