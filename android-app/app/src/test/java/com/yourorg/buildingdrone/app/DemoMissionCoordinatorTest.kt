package com.yourorg.buildingdrone.app

import com.yourorg.buildingdrone.dji.HardwareSnapshot
import com.yourorg.buildingdrone.domain.operations.MissionContextMode
import com.yourorg.buildingdrone.domain.operations.OperationProfile
import com.yourorg.buildingdrone.domain.operations.OperatorConsoleMode
import com.yourorg.buildingdrone.domain.safety.PreflightEvaluation
import com.yourorg.buildingdrone.domain.safety.PreflightGateId
import com.yourorg.buildingdrone.domain.safety.PreflightGateResult
import com.yourorg.buildingdrone.domain.statemachine.FlightStage
import com.yourorg.buildingdrone.ui.ScreenDataState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DemoMissionCoordinatorTest {
    private fun demoCoordinator(
        preflightEvaluation: PreflightEvaluation? = null,
        missionUpload: (() -> CommandActionResult)? = null,
        missionStart: (() -> CommandActionResult)? = null,
        appTakeoff: (() -> CommandActionResult)? = null,
        startReturnHome: (() -> CommandActionResult)? = null,
        startAutoLanding: (() -> CommandActionResult)? = null,
        stopAutoLanding: (() -> CommandActionResult)? = null,
        confirmLanding: (() -> CommandActionResult)? = null,
        landingConfirmationNeeded: (() -> Boolean)? = null,
        landingVerificationSnapshot: (() -> HardwareSnapshot)? = null,
        landingSuitabilityWarning: (() -> String?)? = null
    ): DemoMissionCoordinator {
        val container = AppContainer()
        return DemoMissionCoordinator(
            reducer = container.flightReducer,
            preflightEvaluator = preflightEvaluation?.let { { it } },
            missionUploadExecutor = missionUpload?.let { block -> { _ -> block() } },
            missionStartExecutor = missionStart?.let { block -> { block() } },
            appTakeoffExecutor = appTakeoff?.let { block -> { block() } },
            startReturnHomeExecutor = startReturnHome?.let { block -> { block() } },
            startAutoLandingExecutor = startAutoLanding?.let { block -> { block() } },
            stopAutoLandingExecutor = stopAutoLanding?.let { block -> { block() } },
            confirmLandingExecutor = confirmLanding?.let { block -> { block() } },
            landingConfirmationNeededProvider = landingConfirmationNeeded,
            landingVerificationSnapshotProvider = landingVerificationSnapshot,
            landingSuitabilityWarningProvider = landingSuitabilityWarning
        ).apply {
            attachBundle(com.yourorg.buildingdrone.data.demoMissionBundle())
        }
    }

    private fun prodCoordinator(
        preflightEvaluation: PreflightEvaluation? = null
    ): DemoMissionCoordinator {
        val container = AppContainer()
        return DemoMissionCoordinator(
            reducer = container.flightReducer,
            runtimeMode = RuntimeMode.PROD,
            preflightEvaluator = preflightEvaluation?.let { { it } }
        ).apply {
            attachBundle(com.yourorg.buildingdrone.data.demoMissionBundle())
        }
    }

    private fun outdoorReadyEvaluation(): PreflightEvaluation {
        return PreflightEvaluation(
            canTakeoff = true,
            gates = listOf(
                PreflightGateResult(
                    gateId = PreflightGateId.MISSION_BUNDLE,
                    passed = true,
                    blocking = true,
                    detail = "Mission bundle verified"
                )
            )
        )
    }

    private fun indoorReadyEvaluation(): PreflightEvaluation {
        return PreflightEvaluation(
            canTakeoff = true,
            gates = listOf(
                PreflightGateResult(
                    gateId = PreflightGateId.MISSION_BUNDLE,
                    passed = true,
                    blocking = true,
                    detail = "Mission bundle verified"
                ),
                PreflightGateResult(
                    gateId = PreflightGateId.INDOOR_PROFILE_CONFIRMATION,
                    passed = true,
                    blocking = true,
                    detail = "Indoor no-GPS confirmations complete"
                )
            )
        )
    }

    private fun manualNoBundleReadyEvaluation(): PreflightEvaluation {
        return PreflightEvaluation(
            canTakeoff = true,
            gates = emptyList(),
        )
    }

    @Test
    fun openPreflightChecklist_doesNotApprovePreflight() {
        val coordinator = demoCoordinator()

        coordinator.openPreflightChecklist()

        assertEquals(ConsoleScreen.PREFLIGHT, coordinator.activeScreen)
        assertEquals(FlightStage.PRECHECK, coordinator.flightState.stage)
        assertFalse(coordinator.preflight.readyToUpload)
    }

    @Test
    fun prodMissionSetup_routesToConnectionGuide() {
        val coordinator = prodCoordinator()

        coordinator.continueFromMissionSetup()

        assertEquals(ConsoleScreen.CONNECTION_GUIDE, coordinator.activeScreen)
    }

    @Test
    fun prodOpenPreflightBeforeConnectionGuide_redirectsToConnectionGuide() {
        val coordinator = prodCoordinator()

        coordinator.openPreflightChecklist()

        assertEquals(ConsoleScreen.CONNECTION_GUIDE, coordinator.activeScreen)
        assertEquals(FlightStage.IDLE, coordinator.flightState.stage)
    }

    @Test
    fun prodScreenSelectorCannotBypassConnectionGuideToPreflight() {
        val coordinator = prodCoordinator()

        coordinator.selectScreen(ConsoleScreen.PREFLIGHT)

        assertEquals(ConsoleScreen.CONNECTION_GUIDE, coordinator.activeScreen)
        assertEquals(FlightStage.IDLE, coordinator.flightState.stage)
    }

    @Test
    fun prodConsoleModeList_exposesOnlyOutdoorPatrol() {
        val coordinator = prodCoordinator()

        assertEquals(listOf(OperatorConsoleMode.OUTDOOR_PATROL), coordinator.missionSetup.selectableConsoleModes)
    }

    @Test
    fun demoConsoleModeList_keepsManualDebugModes() {
        val coordinator = demoCoordinator()

        assertTrue(coordinator.missionSetup.selectableConsoleModes.contains(OperatorConsoleMode.INDOOR_MANUAL))
        assertTrue(coordinator.missionSetup.selectableConsoleModes.contains(OperatorConsoleMode.OUTDOOR_MANUAL_PILOT))
    }

    @Test
    fun prodHiddenConsoleModeSelection_isIgnored() {
        val coordinator = prodCoordinator()

        coordinator.selectConsoleMode(OperatorConsoleMode.INDOOR_MANUAL)
        assertEquals(OperatorConsoleMode.OUTDOOR_PATROL, coordinator.selectedConsoleMode)
        assertEquals(OperationProfile.OUTDOOR_GPS_REQUIRED, coordinator.operationProfile)

        coordinator.selectConsoleMode(OperatorConsoleMode.OUTDOOR_MANUAL_PILOT)
        assertEquals(OperatorConsoleMode.OUTDOOR_PATROL, coordinator.selectedConsoleMode)
        assertEquals(OperationProfile.OUTDOOR_GPS_REQUIRED, coordinator.operationProfile)
    }

    @Test
    fun prodIndoorBundleProfile_isCoercedToOutdoorPatrolWithoutWarning() {
        val coordinator = prodCoordinator()
        val indoorBundle = com.yourorg.buildingdrone.data.demoMissionBundle()
            .copy(operatingProfile = OperationProfile.INDOOR_NO_GPS)

        coordinator.attachBundle(indoorBundle)

        assertEquals(OperatorConsoleMode.OUTDOOR_PATROL, coordinator.selectedConsoleMode)
        assertEquals(OperationProfile.OUTDOOR_GPS_REQUIRED, coordinator.operationProfile)
        assertEquals(OperationProfile.INDOOR_NO_GPS, coordinator.missionSetup.plannedOperatingProfile)
        assertEquals(null, coordinator.missionSetup.profileMismatchWarning)
    }

    @Test
    fun prodVisibleScreens_excludeManualBranchAndInspection() {
        val coordinator = prodCoordinator()

        assertFalse(coordinator.visibleScreens.contains(ConsoleScreen.MANUAL_PILOT))
        assertFalse(coordinator.visibleScreens.contains(ConsoleScreen.BRANCH_CONFIRM))
        assertFalse(coordinator.visibleScreens.contains(ConsoleScreen.INSPECTION))
    }

    @Test
    fun prodTakeoverUsesEmergencyInsteadOfManualPilotUi() {
        val coordinator = prodCoordinator()

        coordinator.requestTakeover()

        assertEquals(FlightStage.MANUAL_OVERRIDE, coordinator.flightState.stage)
        assertEquals(ConsoleScreen.EMERGENCY, coordinator.activeScreen)
    }

    @Test
    fun outdoorPatrol_uploadsThenStartsDjiWaypointMissionFromGround() {
        val coordinator = demoCoordinator(
            preflightEvaluation = outdoorReadyEvaluation(),
            missionUpload = { CommandActionResult(success = true) },
            missionStart = { CommandActionResult(success = true) },
            appTakeoff = { CommandActionResult(success = true) }
        )

        coordinator.openPreflightChecklist()
        coordinator.approvePreflight()
        assertEquals(FlightStage.MISSION_READY, coordinator.flightState.stage)
        assertTrue(coordinator.preflight.readyToUpload)
        assertEquals("上傳任務", coordinator.preflight.uploadActionLabel)
        assertFalse(coordinator.preflight.appTakeoffAction.visible)
        assertFalse(coordinator.preflight.rcHoverAction.visible)

        coordinator.uploadAndStartMission()
        assertEquals(FlightStage.MISSION_READY, coordinator.flightState.stage)
        assertTrue(coordinator.flightState.missionUploaded)
        assertTrue(coordinator.preflight.readyToUpload)
        assertEquals("啟動航點任務", coordinator.preflight.uploadActionLabel)
        assertFalse(coordinator.preflight.appTakeoffAction.visible)
        assertFalse(coordinator.preflight.rcHoverAction.visible)

        coordinator.uploadAndStartMission()
        assertEquals(FlightStage.TRANSIT, coordinator.flightState.stage)
    }

    @Test
    fun outdoorPatrol_blocksRcHoverConfirmationAfterMissionUpload() {
        val coordinator = demoCoordinator(
            preflightEvaluation = outdoorReadyEvaluation(),
            missionUpload = { CommandActionResult(success = true) }
        )

        coordinator.openPreflightChecklist()
        coordinator.approvePreflight()
        coordinator.uploadAndStartMission()
        coordinator.confirmRcHoverReady()

        assertEquals(FlightStage.MISSION_READY, coordinator.flightState.stage)
        assertEquals(ScreenDataState.ERROR, coordinator.preflight.status)
        assertTrue(coordinator.preflight.warning?.contains("waypoint mission") == true)
    }

    @Test
    fun indoorAppTakeoff_movesMissionReadyToHoverReady() {
        val coordinator = demoCoordinator(preflightEvaluation = indoorReadyEvaluation())
        coordinator.selectOperationProfile(OperationProfile.INDOOR_NO_GPS)

        coordinator.openPreflightChecklist()
        coordinator.approvePreflight()
        coordinator.requestAppTakeoff()

        assertEquals(FlightStage.HOVER_READY, coordinator.flightState.stage)
        assertTrue(coordinator.preflight.readyToUpload)
    }

    @Test
    fun manualNoBundle_canProceedFromMissionSetupAndEnterManualPilot() {
        val coordinator = DemoMissionCoordinator(
            reducer = AppContainer().flightReducer,
            preflightEvaluator = { manualNoBundleReadyEvaluation() },
            appTakeoffExecutor = { CommandActionResult(success = true) }
        )
        coordinator.attachBundle(bundle = null)
        coordinator.selectConsoleMode(OperatorConsoleMode.OUTDOOR_MANUAL_PILOT)

        assertTrue(coordinator.missionSetup.canContinue)
        assertEquals(MissionContextMode.UNPLANNED_MANUAL, coordinator.missionSetup.missionContextMode)

        coordinator.openConnectionGuide()
        coordinator.openPreflightChecklist()
        coordinator.approvePreflight()
        coordinator.requestAppTakeoff()
        coordinator.uploadAndStartMission()

        assertEquals(FlightStage.MANUAL_OVERRIDE, coordinator.flightState.stage)
        assertEquals(MissionContextMode.UNPLANNED_MANUAL, coordinator.flightState.missionContextMode)
        assertEquals(ConsoleScreen.MANUAL_PILOT, coordinator.activeScreen)
    }

    @Test
    fun patrolWithoutBundle_staysBlockedInMissionSetup() {
        val coordinator = DemoMissionCoordinator(
            reducer = AppContainer().flightReducer,
            preflightEvaluator = { outdoorReadyEvaluation() }
        )
        coordinator.attachBundle(bundle = null)
        coordinator.selectConsoleMode(OperatorConsoleMode.OUTDOOR_PATROL)

        assertFalse(coordinator.missionSetup.canContinue)
        assertEquals(MissionContextMode.PLANNED_BUNDLE, coordinator.missionSetup.missionContextMode)
    }

    @Test
    fun indoorManual_entersManualPilotInsteadOfMissionAutonomy() {
        val coordinator = demoCoordinator(
            preflightEvaluation = indoorReadyEvaluation(),
        )
        coordinator.selectOperationProfile(OperationProfile.INDOOR_NO_GPS)

        coordinator.openPreflightChecklist()
        coordinator.approvePreflight()
        coordinator.requestAppTakeoff()
        coordinator.uploadAndStartMission()

        assertEquals(FlightStage.MANUAL_OVERRIDE, coordinator.flightState.stage)
        assertEquals(ConsoleScreen.MANUAL_PILOT, coordinator.activeScreen)
        assertEquals(MissionContextMode.PLANNED_BUNDLE, coordinator.flightState.missionContextMode)
    }

    @Test
    fun requestRth_inIndoorModeShowsUnavailableMessage() {
        val coordinator = demoCoordinator(preflightEvaluation = indoorReadyEvaluation())
        coordinator.selectOperationProfile(OperationProfile.INDOOR_NO_GPS)
        coordinator.openPreflightChecklist()
        coordinator.approvePreflight()

        coordinator.requestRth()

        assertEquals(FlightStage.MISSION_READY, coordinator.flightState.stage)
        assertFalse(coordinator.emergency.primaryActionEnabled)
        assertFalse(coordinator.emergency.secondaryActionEnabled)
        assertEquals(ConsoleScreen.EMERGENCY, coordinator.activeScreen)
    }

    @Test
    fun requestRth_inOutdoorModeInvokesDjiReturnHomeCommand() {
        var returnHomeRequested = false
        val coordinator = demoCoordinator(
            preflightEvaluation = outdoorReadyEvaluation(),
            startReturnHome = {
                returnHomeRequested = true
                CommandActionResult(success = true)
            }
        )
        coordinator.openPreflightChecklist()
        coordinator.approvePreflight()

        coordinator.requestRth()

        assertTrue(returnHomeRequested)
        assertEquals(FlightStage.RTH, coordinator.flightState.stage)
        assertEquals(ConsoleScreen.EMERGENCY, coordinator.activeScreen)
    }

    @Test
    fun requestRth_staysOutOfRthWhenDjiCommandFails() {
        val coordinator = demoCoordinator(
            preflightEvaluation = outdoorReadyEvaluation(),
            startReturnHome = { CommandActionResult(success = false, message = "RTH unavailable") }
        )
        coordinator.openPreflightChecklist()
        coordinator.approvePreflight()

        coordinator.requestRth()

        assertEquals(FlightStage.MISSION_READY, coordinator.flightState.stage)
        assertEquals("RTH unavailable", coordinator.emergency.reason)
        assertEquals(ConsoleScreen.EMERGENCY, coordinator.activeScreen)
    }

    @Test
    fun takeover_enablesSecondaryEmergencyAction() {
        val coordinator = demoCoordinator()

        coordinator.requestTakeover()

        assertEquals(FlightStage.MANUAL_OVERRIDE, coordinator.flightState.stage)
        assertTrue(coordinator.emergency.secondaryActionEnabled)
        assertFalse(coordinator.emergency.primaryActionEnabled)
    }

    @Test
    fun landingConfirmationPrompt_confirmsLandingAndCompletesFlight() {
        val coordinator = demoCoordinator(
            preflightEvaluation = indoorReadyEvaluation(),
            appTakeoff = { CommandActionResult(success = true) },
            startAutoLanding = { CommandActionResult(success = true) },
            stopAutoLanding = { CommandActionResult(success = true) },
            landingConfirmationNeeded = { true }
        )
        coordinator.selectOperationProfile(OperationProfile.INDOOR_NO_GPS)
        coordinator.openPreflightChecklist()
        coordinator.approvePreflight()
        coordinator.requestAppTakeoff()

        coordinator.requestLand()
        coordinator.runPrimaryEmergencyAction()

        assertEquals(ConsoleScreen.MANUAL_PILOT, coordinator.activeScreen)
        assertEquals(FlightStage.COMPLETED, coordinator.flightState.stage)
    }

    @Test
    fun confirmLandingFailure_fallsBackToRcOnlyLanding() {
        val coordinator = demoCoordinator(
            preflightEvaluation = indoorReadyEvaluation(),
            appTakeoff = { CommandActionResult(success = true) },
            startAutoLanding = { CommandActionResult(success = true) },
            confirmLanding = { CommandActionResult(success = false, message = "unsupported") },
            landingConfirmationNeeded = { true }
        )
        coordinator.selectOperationProfile(OperationProfile.INDOOR_NO_GPS)
        coordinator.openPreflightChecklist()
        coordinator.approvePreflight()
        coordinator.requestAppTakeoff()
        coordinator.requestLand()

        coordinator.runSecondaryEmergencyAction()

        assertEquals(FlightStage.MANUAL_OVERRIDE, coordinator.flightState.stage)
        assertEquals(ConsoleScreen.EMERGENCY, coordinator.activeScreen)
        assertTrue(coordinator.emergency.reason.contains("RC"))
    }
}
