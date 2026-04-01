package com.yourorg.buildingdrone.feature.mission

import com.yourorg.buildingdrone.ui.ScreenDataState

data class MissionSetupUiState(
    val bundleLoaded: Boolean,
    val demoMode: Boolean,
    val status: ScreenDataState = if (bundleLoaded) ScreenDataState.SUCCESS else ScreenDataState.EMPTY,
    val missionLabel: String = if (bundleLoaded) "Mock mission ready" else "No mission loaded",
    val summary: List<String> = emptyList(),
    val artifactStatus: String = if (bundleLoaded) "mission meta + local demo bundle ready" else "artifacts missing",
    val warning: String? = null
)
