package com.yourorg.buildingdrone.feature.branchverify

import com.yourorg.buildingdrone.ui.ScreenDataState

data class BranchVerifyUiState(
    val availableOptions: List<String>,
    val status: ScreenDataState = ScreenDataState.EMPTY,
    val confidenceLabel: String = "\u7b49\u5f85\u6a21\u578b\u5224\u65b7",
    val countdownSeconds: Int = 0,
    val reason: String? = null,
    val nextStep: String = "\u4eba\u5de5\u78ba\u8a8d\u5de6 / \u76f4\u884c / \u53f3\uff0c\u903e\u6642\u5247\u9032\u5165 HOLD"
)
