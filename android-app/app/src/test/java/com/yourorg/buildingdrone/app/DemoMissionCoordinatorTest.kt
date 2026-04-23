package com.yourorg.buildingdrone.app

import com.yourorg.buildingdrone.dji.HardwareSnapshot
import com.yourorg.buildingdrone.domain.operations.AutonomyCapability
import com.yourorg.buildingdrone.domain.operations.OperationProfile
import com.yourorg.buildingdrone.domain.safety.PreflightEvaluation
import com.yourorg.buildingdrone.domain.safety.PreflightGateId
import com.yourorg.buildingdrone.domain.safety.PreflightGateResult
import com.yourorg.buildingdrone.domain.statemachine.FlightStage
import com.yourorg.buildingdrone.feature.simulator.SimulatorVerificationUiState
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

    @Test
    fun openPreflightChecklist_doesNotApprovePreflight() {
        val coordinator = demoCoordinator()

        coordinator.openPreflightChecklist()

        assertEquals(ConsoleScreen.PREFLIGHT, coordinator.activeScreen)
        assertEquals(FlightStage.PRECHECK, coordinator.flightState.stage)
        assertFalse(coordinator.preflight.readyToUpload)
    }

    @Test
    fun prodOutdoorMissionSetup_routesToSimulatorVerification() {
        val coordinator = prodCoordinator()

        coordinator.openPreflightChecklist()

        assertEquals(ConsoleScreen.MISSION_SETUP, coordinator.activeScreen)
        assertTrue(coordinator.showSimulatorVerification)
    }

    @Test
    fun continueFromSimulatorVerification_routesToConnectionGuideAfterPass() {
        val coordinator = prodCoordinator()
        coordinator.openSimulatorVerification()
        coordinator.applySimulatorVerification(
            SimulatorVerificationUiState(
                status = ScreenDataState.SUCCESS,
                canContinueToConnectionGuide = true
            )
        )

        coordinator.continueFromSimulatorVerification()

        assertEquals(ConsoleScreen.CONNECTION_GUIDE, coordinator.activeScreen)
        assertFalse(coordinator.showSimulatorVerification)
    }

    @Test
    fun outdoorPatrol_runs_upload_takeoff_hover_start_flow() {
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
        assertTrue(coordinator.preflight.uploadActionLabel.contains("上傳"))

        coordinator.uploadAndStartMission()
        assertEquals(FlightStage.TAKEOFF, coordinator.flightState.stage)
        assertTrue(coordinator.preflight.appTakeoffAction.enabled)
        assertTrue(coordinator.preflight.rcHoverAction.enabled)

        coordinator.requestAppTakeoff()
        assertEquals(FlightStage.HOVER_READY, coordinator.flightState.stage)
        assertTrue(coordinator.preflight.readyToUpload)
        assertTrue(coordinator.preflight.uploadActionLabel.contains("開始"))

        coordinator.uploadAndStartMission()
        assertEquals(FlightStage.TRANSIT, coordinator.flightState.stage)
    }

    @Test
    fun outdoorRcTakeoff_confirmationMovesToHoverReady() {
        val coordinator = demoCoordinator(
            preflightEvaluation = outdoorReadyEvaluation(),
            missionUpload = { CommandActionResult(success = true) }
        )

        coordinator.openPreflightChecklist()
        coordinator.approvePreflight()
        coordinator.uploadAndStartMission()
        coordinator.confirmRcHoverReady()

        assertEquals(FlightStage.HOVER_READY, coordinator.flightState.stage)
        assertTrue(coordinator.preflight.readyToUpload)
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
    fun indoorMissionStartFailure_marksAutonomyUnsupported() {
        val coordinator = demoCoordinator(
            preflightEvaluation = indoorReadyEvaluation(),
            missionUpload = { CommandActionResult(success = true) },
            missionStart = {
                CommandActionResult(success = false, message = "DJI rejected indoor mission start.")
            }
        )
        coordinator.selectOperationProfile(OperationProfile.INDOOR_NO_GPS)

        coordinator.openPreflightChecklist()
        coordinator.approvePreflight()
        coordinator.requestAppTakeoff()
        coordinator.uploadAndStartMission()

        assertEquals(FlightStage.HOVER_READY, coordinator.flightState.stage)
        assertEquals(AutonomyCapability.UNSUPPORTED, coordinator.indoorAutonomyCapability)
        assertFalse(coordinator.preflight.readyToUpload)
        assertEquals(ScreenDataState.ERROR, coordinator.preflight.status)
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
    fun takeover_enablesSecondaryEmergencyAction() {
        val coordinator = demoCoordinator()

        coordinator.requestTakeover()

        assertEquals(FlightStage.MANUAL_OVERRIDE, coordinator.flightState.stage)
        assertTrue(coordinator.emergency.secondaryActionEnabled)
        assertFalse(coordinator.emergency.primaryActionEnabled)
    }

    @Test
    fun landingConfirmationPrompt_allowsContinueHover() {
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

        assertEquals(ConsoleScreen.IN_FLIGHT, coordinator.activeScreen)
        assertEquals(FlightStage.HOVER_READY, coordinator.flightState.stage)
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
