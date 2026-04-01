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
        assertEquals("尚未載入任務前，不能通過飛前檢查。", coordinator.preflight.warning)
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
        assertEquals("拍攝前請先完成視角對位", coordinator.inspection.reason)
        assertFalse(coordinator.inspection.captureEnabled)
    }

    @Test
    fun uploadAndBranchActions_requireValidStages() {
        val coordinator = coordinator()

        coordinator.uploadAndStartMission()
        coordinator.triggerBranchConfirm()

        assertEquals(ConsoleScreen.IN_FLIGHT, coordinator.activeScreen)
        assertEquals(FlightStage.IDLE, coordinator.flightState.stage)
        assertEquals("在檢查表通過前，禁止上傳任務。", coordinator.preflight.warning)
        assertEquals("只有在飛行中巡航階段才能觸發岔路確認。", coordinator.transit.partialWarning)
    }

    @Test
    fun completeRthLanding_ignoresNonRthStages() {
        val coordinator = coordinator()

        coordinator.completeRthLanding()

        assertEquals(FlightStage.IDLE, coordinator.flightState.stage)
    }

    @Test
    fun emergencyActions_areEnabledOnlyForMatchingStage() {
        val coordinator = coordinator()
        coordinator.loadMockMission()
        coordinator.approvePreflight()
        coordinator.uploadAndStartMission()

        coordinator.requestRth()
        assertTrue(coordinator.emergency.completeLandingEnabled)
        assertFalse(coordinator.emergency.abortManualEnabled)

        coordinator.completeRthLanding()
        assertEquals(FlightStage.LANDING, coordinator.flightState.stage)

        coordinator.completeRthLanding()
        assertEquals(FlightStage.COMPLETED, coordinator.flightState.stage)

        coordinator.requestTakeover()
        assertTrue(coordinator.emergency.abortManualEnabled)
        assertFalse(coordinator.emergency.completeLandingEnabled)
    }
}
