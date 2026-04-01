package com.yourorg.buildingdrone.feature.mission

import com.yourorg.buildingdrone.ui.ScreenDataState

data class MissionSetupUiState(
    val bundleLoaded: Boolean,
    val demoMode: Boolean,
    val status: ScreenDataState = if (bundleLoaded) ScreenDataState.SUCCESS else ScreenDataState.EMPTY,
    val missionLabel: String = if (bundleLoaded) "模擬任務已就緒" else "尚未載入任務",
    val summary: List<String> = emptyList(),
    val artifactStatus: String = if (bundleLoaded) "任務中繼資料與本地展示任務包已就緒" else "缺少任務產物",
    val warning: String? = null
)
