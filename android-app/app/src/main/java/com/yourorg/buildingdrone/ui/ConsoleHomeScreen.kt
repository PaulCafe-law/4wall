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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.dp
import com.yourorg.buildingdrone.app.ConsoleScreen
import com.yourorg.buildingdrone.app.DemoMissionCoordinator
import com.yourorg.buildingdrone.feature.branchverify.BranchConfirmScreen
import com.yourorg.buildingdrone.feature.emergency.EmergencyScreen
import com.yourorg.buildingdrone.feature.inspection.InspectionCaptureScreen
import com.yourorg.buildingdrone.feature.mission.MissionSetupScreen
import com.yourorg.buildingdrone.feature.preflight.PreflightChecklistScreen
import com.yourorg.buildingdrone.feature.transit.InFlightMainScreen

@Composable
fun ConsoleHomeScreen(
    demoCoordinator: DemoMissionCoordinator
) {
    val scrollState = rememberScrollState()

    Scaffold(
        bottomBar = {
            EmergencyActionRail(
                onHold = demoCoordinator::requestHold,
                onRth = demoCoordinator::requestRth,
                onTakeover = demoCoordinator::requestTakeover
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            MaterialTheme.colorScheme.background,
                            MaterialTheme.colorScheme.surface
                        )
                    )
                )
                .padding(paddingValues)
                .safeDrawingPadding()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(scrollState)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                ConsoleHeader(
                    stage = demoCoordinator.currentStageLabel,
                    reason = demoCoordinator.emergency.reason,
                    nextStep = demoCoordinator.emergency.nextStep
                )
                ScreenSelector(
                    active = demoCoordinator.activeScreen,
                    onSelected = demoCoordinator::selectScreen
                )
                when (demoCoordinator.activeScreen) {
                    ConsoleScreen.MISSION_SETUP -> MissionSetupScreen(
                        state = demoCoordinator.missionSetup,
                        onLoadMockMission = demoCoordinator::loadMockMission,
                        onReplay = demoCoordinator::replayTelemetry,
                        onGoPreflight = demoCoordinator::openPreflightChecklist
                    )

                    ConsoleScreen.PREFLIGHT -> PreflightChecklistScreen(
                        state = demoCoordinator.preflight,
                        onApprove = demoCoordinator::approvePreflight,
                        onUploadMission = demoCoordinator::uploadAndStartMission
                    )

                    ConsoleScreen.IN_FLIGHT -> InFlightMainScreen(
                        state = demoCoordinator.transit,
                        onReplayTelemetry = demoCoordinator::replayTelemetry,
                        onTriggerBranch = demoCoordinator::triggerBranchConfirm,
                        onTriggerObstacleWarn = demoCoordinator::triggerObstacleWarn,
                        onTriggerObstacleHardStop = demoCoordinator::triggerObstacleHardStop,
                        onClearObstacle = demoCoordinator::clearObstacle,
                        onApproachInspection = demoCoordinator::triggerInspectionApproach
                    )

                    ConsoleScreen.BRANCH_CONFIRM -> BranchConfirmScreen(
                        state = demoCoordinator.branchVerify,
                        onChooseLeft = { demoCoordinator.confirmBranch("LEFT") },
                        onChooseRight = { demoCoordinator.confirmBranch("RIGHT") },
                        onChooseStraight = { demoCoordinator.confirmBranch("STRAIGHT") },
                        onTimeout = demoCoordinator::branchTimeout,
                        onHold = demoCoordinator::requestHold,
                        onTakeover = demoCoordinator::requestTakeover
                    )

                    ConsoleScreen.INSPECTION -> InspectionCaptureScreen(
                        state = demoCoordinator.inspection,
                        onAlign = demoCoordinator::alignView,
                        onCapture = demoCoordinator::captureView,
                        onHold = demoCoordinator::requestHold
                    )

                    ConsoleScreen.EMERGENCY -> EmergencyScreen(
                        state = demoCoordinator.emergency,
                        onPrimaryAction = demoCoordinator::runPrimaryEmergencyAction,
                        onSecondaryAction = demoCoordinator::runSecondaryEmergencyAction
                    )
                }
            }
        }
    }
}

@Composable
private fun ConsoleHeader(
    stage: String,
    reason: String,
    nextStep: String
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(28.dp)
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text("Mini 4 Pro Building Route Assistant", style = MaterialTheme.typography.headlineSmall)
            Text("目前飛行階段: $stage", style = MaterialTheme.typography.titleMedium)
            Text("停住原因 / 主要風險: $reason", style = MaterialTheme.typography.bodyLarge)
            Text("下一步: $nextStep", style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun ScreenSelector(
    active: ConsoleScreen,
    onSelected: (ConsoleScreen) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        ConsoleScreen.entries.forEach { screen ->
            FilterChip(
                selected = active == screen,
                onClick = { onSelected(screen) },
                label = { Text(screen.label) }
            )
        }
    }
}

@Composable
private fun EmergencyActionRail(
    onHold: () -> Unit,
    onRth: () -> Unit,
    onTakeover: () -> Unit
) {
    Surface(
        tonalElevation = 6.dp,
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .statusBarsPadding()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            FilledTonalButton(
                modifier = Modifier.weight(1f),
                onClick = onHold
            ) {
                Text("HOLD")
            }
            FilledTonalButton(
                modifier = Modifier.weight(1f),
                onClick = onRth
            ) {
                Text("RTH")
            }
            FilledTonalButton(
                modifier = Modifier.weight(1f),
                onClick = onTakeover
            ) {
                Text("TAKEOVER")
            }
        }
    }
}
