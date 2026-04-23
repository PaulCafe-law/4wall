package com.yourorg.buildingdrone.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.yourorg.buildingdrone.app.ConsoleScreen
import com.yourorg.buildingdrone.app.DemoMissionCoordinator
import com.yourorg.buildingdrone.feature.connection.ConnectionGuideScreen
import com.yourorg.buildingdrone.feature.emergency.EmergencyScreen
import com.yourorg.buildingdrone.feature.manualpilot.ManualPilotScreen
import com.yourorg.buildingdrone.feature.manualpilot.ManualPilotUiState
import com.yourorg.buildingdrone.feature.mission.MissionSetupScreen
import com.yourorg.buildingdrone.feature.preflight.PreflightChecklistScreen
import com.yourorg.buildingdrone.feature.simulator.SimulatorVerificationScreen
import com.yourorg.buildingdrone.feature.transit.InFlightMainScreen

@Composable
fun ConsoleHomeScreen(
    demoCoordinator: DemoMissionCoordinator,
    manualPilotState: ManualPilotUiState? = null,
    manualPilotPreview: (@Composable () -> Unit)? = null,
    onManualLeftStickChanged: (Float, Float) -> Unit = { _, _ -> },
    onManualLeftStickReleased: () -> Unit = {},
    onManualRightStickChanged: (Float, Float) -> Unit = { _, _ -> },
    onManualRightStickReleased: () -> Unit = {},
    onManualTakePhoto: () -> Unit = {},
    onManualToggleRecording: () -> Unit = {},
    onManualTiltUp: () -> Unit = {},
    onManualTiltDown: () -> Unit = {},
    onManualReturnToHome: () -> Unit = {},
    showLogoutAction: Boolean = false,
    logoutEnabled: Boolean = false,
    logoutInProgress: Boolean = false,
    onLogoutClick: (() -> Unit)? = null,
) {
    val scrollState = rememberScrollState()

    Scaffold(
        bottomBar = {
            EmergencyActionRail(
                onHold = demoCoordinator::requestHold,
                onSecondary = {
                    if (demoCoordinator.supportsReturnToHome) {
                        demoCoordinator.requestRth()
                    } else {
                        demoCoordinator.requestLand()
                    }
                },
                secondaryLabel = demoCoordinator.railSecondaryLabel,
                secondaryEnabled = demoCoordinator.railSecondaryEnabled,
                onTakeover = demoCoordinator::requestTakeover,
            )
        },
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            MaterialTheme.colorScheme.background,
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                            MaterialTheme.colorScheme.background,
                        ),
                    ),
                )
                .padding(paddingValues)
                .safeDrawingPadding(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(scrollState)
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                ConsoleHeader(
                    stage = demoCoordinator.currentStageLabel,
                    reason = demoCoordinator.emergency.reason,
                    nextStep = demoCoordinator.emergency.nextStep,
                    showLogoutAction = showLogoutAction,
                    logoutEnabled = logoutEnabled,
                    logoutInProgress = logoutInProgress,
                    onLogoutClick = onLogoutClick,
                )
                ScreenSelector(
                    screens = demoCoordinator.visibleScreens,
                    active = demoCoordinator.activeScreen,
                    onSelected = demoCoordinator::selectScreen,
                )
                when (demoCoordinator.activeScreen) {
                    ConsoleScreen.MISSION_SETUP -> if (demoCoordinator.showSimulatorVerification) {
                        SimulatorVerificationScreen(
                            state = demoCoordinator.simulatorVerification,
                            onRefresh = demoCoordinator::refreshSimulatorVerification,
                            onEnableSimulator = demoCoordinator::enableSimulatorVerification,
                            onDisableSimulator = demoCoordinator::disableSimulatorVerification,
                            onRunBranchReplay = demoCoordinator::runBranchHoldRthReplay,
                            onRunInspectionReplay = demoCoordinator::runInspectionCaptureReplay,
                            onActivateBenchOnlyFallback = demoCoordinator::activateBenchOnlyFallback,
                            onContinue = demoCoordinator::continueFromSimulatorVerification,
                        )
                    } else {
                        MissionSetupScreen(
                            state = demoCoordinator.missionSetup,
                            onLoadMockMission = demoCoordinator::loadMockMission,
                            onReplay = demoCoordinator::replayTelemetry,
                            onGoPreflight = demoCoordinator::openPreflightChecklist,
                            onSelectConsoleMode = demoCoordinator::selectConsoleMode,
                        )
                    }

                    ConsoleScreen.CONNECTION_GUIDE -> ConnectionGuideScreen(
                        state = demoCoordinator.connectionGuide,
                        onRetry = demoCoordinator::retryConnectionGuide,
                        onContinue = demoCoordinator::continueFromConnectionGuide,
                    )

                    ConsoleScreen.PREFLIGHT -> PreflightChecklistScreen(
                        state = demoCoordinator.preflight,
                        onApprove = demoCoordinator::approvePreflight,
                        onUploadMission = demoCoordinator::uploadAndStartMission,
                        onToggleIndoorConfirmation = demoCoordinator::toggleIndoorConfirmation,
                        onAppTakeoff = demoCoordinator::requestAppTakeoff,
                        onRcHoverReady = demoCoordinator::confirmRcHoverReady,
                        onLand = demoCoordinator::requestLand,
                    )

                    ConsoleScreen.IN_FLIGHT -> InFlightMainScreen(
                        state = demoCoordinator.transit,
                    )

                    ConsoleScreen.MANUAL_PILOT -> ManualPilotScreen(
                        state = manualPilotState ?: ManualPilotUiState(
                            consoleLabel = "Manual Pilot",
                            summary = "本機手動飛行模式已就緒，可使用相機預覽與雙搖桿進行保守操控。",
                        ),
                        previewContent = { manualPilotPreview?.invoke() ?: Box(modifier = Modifier.fillMaxSize()) },
                        onLeftStickChanged = onManualLeftStickChanged,
                        onLeftStickReleased = onManualLeftStickReleased,
                        onRightStickChanged = onManualRightStickChanged,
                        onRightStickReleased = onManualRightStickReleased,
                        onTakePhoto = onManualTakePhoto,
                        onToggleRecording = onManualToggleRecording,
                        onTiltUp = onManualTiltUp,
                        onTiltDown = onManualTiltDown,
                        onReturnToHome = onManualReturnToHome,
                    )

                    ConsoleScreen.EMERGENCY -> EmergencyScreen(
                        state = demoCoordinator.emergency,
                        onPrimaryAction = demoCoordinator::runPrimaryEmergencyAction,
                        onSecondaryAction = demoCoordinator::runSecondaryEmergencyAction,
                    )

                    ConsoleScreen.BRANCH_CONFIRM,
                    ConsoleScreen.INSPECTION -> LegacyFlowRetiredPanel()
                }
            }
        }
    }
}

@Composable
private fun ConsoleHeader(
    stage: String,
    reason: String,
    nextStep: String,
    showLogoutAction: Boolean,
    logoutEnabled: Boolean,
    logoutInProgress: Boolean,
    onLogoutClick: (() -> Unit)?,
) {
    ConsoleHeroPanel(
        eyebrow = "patrol console",
        title = "今日任務快照",
        statusLabel = stage,
        statusTone = MaterialTheme.colorScheme.secondary,
        actions = {
            if (showLogoutAction && onLogoutClick != null) {
                OutlinedButton(
                    onClick = onLogoutClick,
                    enabled = logoutEnabled,
                ) {
                    Text(if (logoutInProgress) "登出中" else "登出")
                }
            }
        },
    ) {
        Text(
            text = reason.ifBlank { "系統已進入當前任務階段。" },
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = nextStep,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
        )
    }
}

@Composable
private fun ScreenSelector(
    screens: List<ConsoleScreen>,
    active: ConsoleScreen,
    onSelected: (ConsoleScreen) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        screens.forEach { screen ->
            FilterChip(
                selected = active == screen,
                onClick = { onSelected(screen) },
                label = {
                    Text(
                        text = screen.label,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                    selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer,
                    containerColor = MaterialTheme.colorScheme.surface,
                    labelColor = MaterialTheme.colorScheme.onSurfaceVariant,
                ),
            )
        }
    }
}

@Composable
private fun EmergencyActionRail(
    onHold: () -> Unit,
    onSecondary: () -> Unit,
    secondaryLabel: String,
    secondaryEnabled: Boolean,
    onTakeover: () -> Unit,
) {
    Surface(
        tonalElevation = 4.dp,
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding(),
        color = MaterialTheme.colorScheme.surface,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FilledTonalButton(
                modifier = Modifier.weight(1f),
                onClick = onHold,
                colors = ButtonDefaults.filledTonalButtonColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                    contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                ),
            ) {
                Text("保持", maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            FilledTonalButton(
                modifier = Modifier.weight(1f),
                onClick = onSecondary,
                enabled = secondaryEnabled,
                colors = ButtonDefaults.filledTonalButtonColors(
                    containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                    contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
                ),
            ) {
                Text(secondaryLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            FilledTonalButton(
                modifier = Modifier.weight(1f),
                onClick = onTakeover,
                colors = ButtonDefaults.filledTonalButtonColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                ),
            ) {
                Text("接管", maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun LegacyFlowRetiredPanel() {
    ConsolePanel(
        title = "Legacy flow retained",
        subtitle = "這些流程仍保留在 codebase 與 debug harness，但不再屬於 prod operator 主流程。",
    ) {
        Text(
            text = "Branch confirm 與巡檢拍攝流程目前已退出正式控台，只留作相容與測試用途。",
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}
