package com.yourorg.buildingdrone.feature.mission

import com.yourorg.buildingdrone.ui.ScreenDataState

data class MissionSetupUiState(
    val bundleLoaded: Boolean,
    val demoMode: Boolean,
    val status: ScreenDataState = if (bundleLoaded) ScreenDataState.SUCCESS else ScreenDataState.EMPTY,
    val missionLabel: String = if (bundleLoaded) "任務已就緒" else "尚未下載任務",
    val summary: List<String> = emptyList(),
    val artifactStatus: String = if (bundleLoaded) "mission.kmz / mission_meta.json 已驗證" else "尚未取得任務 artifacts",
    val warning: String? = null,
    val loadActionLabel: String = if (demoMode) "載入 Demo 任務" else "登入並下載任務",
    val authStatus: String? = null
)
