package com.yourorg.buildingdrone.feature.mission

import com.yourorg.buildingdrone.ui.ScreenDataState

data class MissionSetupUiState(
    val bundleLoaded: Boolean,
    val demoMode: Boolean,
    val status: ScreenDataState = if (bundleLoaded) ScreenDataState.SUCCESS else ScreenDataState.EMPTY,
    val missionLabel: String = if (bundleLoaded) "\u4efb\u52d9\u5305\u5df2\u5c31\u7dd2" else "\u5c1a\u672a\u8f09\u5165\u4efb\u52d9\u5305",
    val summary: List<String> = emptyList(),
    val artifactStatus: String = if (bundleLoaded) {
        "mission.kmz \u8207 mission_meta.json \u5df2\u5c31\u7dd2"
    } else {
        "\u5c1a\u672a\u4e0b\u8f09 mission artifacts"
    },
    val warning: String? = null,
    val loadActionLabel: String = if (demoMode) "\u8f09\u5165 Demo \u4efb\u52d9" else "\u767b\u5165\u5f8c\u540c\u6b65\u4efb\u52d9",
    val authStatus: String? = null,
    val nextStep: String = if (bundleLoaded) {
        "\u9032\u5165 Preflight Checklist\uff0c\u78ba\u8a8d\u8d77\u98db gate"
    } else {
        "\u5148\u4e0b\u8f09\u4e26\u9a57\u8b49\u5b8c\u6574 mission bundle"
    }
)
