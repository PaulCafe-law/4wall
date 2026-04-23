package com.yourorg.buildingdrone.feature.simulator

import com.yourorg.buildingdrone.ui.ScreenDataState

data class SimulatorVerificationChecklistItem(
    val label: String,
    val passed: Boolean,
    val detail: String
)

data class SimulatorVerificationUiState(
    val status: ScreenDataState = ScreenDataState.EMPTY,
    val summary: String = "Run simulator verification before direct aircraft checks.",
    val warning: String? = null,
    val nextStep: String = "Enable the in-app simulator and replay the required scenarios.",
    val observerNote: String = "Use DJI Assistant 2 only when this aircraft and firmware actually expose simulator visualization. If Mini 4 Pro is detected but no simulator page appears, record Stage 0 as unavailable and continue with the in-app MSDK simulator gate only.",
    val simulatorStatusLabel: String = "No simulator state observed yet.",
    val checklist: List<SimulatorVerificationChecklistItem> = emptyList(),
    val canActivateBenchOnlyFallback: Boolean = true,
    val benchOnlyFallbackActive: Boolean = false,
    val propOnBlockedReason: String? = null,
    val canContinueToConnectionGuide: Boolean = false,
    val continueLabel: String = "Continue to Connection Guide",
    val benchOnlyFallbackLabel: String = "Skip Simulator -> Bench Only",
    val refreshLabel: String = "Refresh simulator gate",
    val enableLabel: String = "Enable simulator",
    val disableLabel: String = "Disable simulator",
    val branchReplayLabel: String = "Replay Branch -> HOLD -> RTH",
    val inspectionReplayLabel: String = "Replay Inspection -> Capture",
    val simulatorActionsEnabled: Boolean = true
)
