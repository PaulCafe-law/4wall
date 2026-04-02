package com.yourorg.buildingdrone.app

import com.yourorg.buildingdrone.data.demoMissionBundle
import com.yourorg.buildingdrone.domain.statemachine.FlightStage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DemoMissionCoordinatorTest {
    private fun coordinator(): DemoMissionCoordinator {
        val container = AppContainer()
        return DemoMissionCoordinator(container.flightReducer).apply {
            attachBundle(demoMissionBundle())
        }
    }

    @Test
    fun openPreflightChecklist_doesNotApprovePreflight() {
        val coordinator = coordinator()
        coordinator.loadMockMission()
        coordinator.selectScreen(ConsoleScreen.MISSION_SETUP)

        coordinator.openPreflightChecklist()

        assertEquals(ConsoleScreen.PREFLIGHT, coordinator.activeScreen)
        assertEquals(FlightStage.PRECHECK, coordinator.flightState.stage)
        assertFalse(coordinator.preflight.readyToUpload)
    }

    @Test
    fun approvePreflight_requiresMissionLoadSequence() {
        val coordinator = coordinator()

        coordinator.openPreflightChecklist()
        coordinator.approvePreflight()

        assertEquals(FlightStage.IDLE, coordinator.flightState.stage)
        assertFalse(coordinator.preflight.readyToUpload)
        assertEquals("只有在 PRECHECK 才能批准 preflight。", coordinator.preflight.warning)
    }

    @Test
    fun captureView_requiresAlignmentBeforeCapture() {
        val coordinator = coordinator()
        coordinator.loadMockMission()
        coordinator.approvePreflight()
        coordinator.uploadAndStartMission()
        coordinator.triggerInspectionApproach()

        coordinator.captureView()

        assertEquals(ConsoleScreen.INSPECTION, coordinator.activeScreen)
        assertEquals(FlightStage.APPROACH_VIEWPOINT, coordinator.flightState.stage)
        assertEquals("必須先完成 Align View，才能 Capture。", coordinator.inspection.reason)
        assertFalse(coordinator.inspection.captureEnabled)
    }

    @Test
    fun uploadAndBranchActions_requireValidStages() {
        val coordinator = coordinator()

        coordinator.uploadAndStartMission()
        coordinator.triggerBranchConfirm()

        assertEquals(ConsoleScreen.IN_FLIGHT, coordinator.activeScreen)
        assertEquals(FlightStage.IDLE, coordinator.flightState.stage)
        assertEquals("目前不允許上傳任務。", coordinator.preflight.warning)
        assertEquals("目前 stage 不允許進入 branch confirm。", coordinator.transit.partialWarning)
    }

    @Test
    fun completeRthLanding_ignoresNonRthStages() {
        val coordinator = coordinator()

        coordinator.completeRthLanding()

        assertEquals(FlightStage.IDLE, coordinator.flightState.stage)
    }

    @Test
    fun emergencyActions_exposeResumeAndLandingPaths() {
        val coordinator = coordinator()
        coordinator.loadMockMission()
        coordinator.approvePreflight()
        coordinator.uploadAndStartMission()

        coordinator.requestHold()
        assertTrue(coordinator.emergency.primaryActionEnabled)
        assertFalse(coordinator.emergency.secondaryActionEnabled)
        coordinator.runPrimaryEmergencyAction()
        assertEquals(FlightStage.TRANSIT, coordinator.flightState.stage)

        coordinator.requestRth()
        assertTrue(coordinator.emergency.primaryActionEnabled)
        assertFalse(coordinator.emergency.secondaryActionEnabled)

        coordinator.completeRthLanding()
        assertEquals(FlightStage.LANDING, coordinator.flightState.stage)

        coordinator.completeRthLanding()
        assertEquals(FlightStage.COMPLETED, coordinator.flightState.stage)
    }

    @Test
    fun takeover_enablesSecondaryAbortAction() {
        val coordinator = coordinator()
        coordinator.requestTakeover()

        assertEquals(FlightStage.MANUAL_OVERRIDE, coordinator.flightState.stage)
        assertTrue(coordinator.emergency.secondaryActionEnabled)
        assertFalse(coordinator.emergency.primaryActionEnabled)
    }
}
