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
        assertEquals("Preflight cannot be approved before mission load.", coordinator.preflight.warning)
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
        assertEquals("Align viewpoint before capture", coordinator.inspection.reason)
        assertFalse(coordinator.inspection.captureEnabled)
    }

    @Test
    fun uploadAndBranchActions_requireValidStages() {
        val coordinator = coordinator()

        coordinator.uploadAndStartMission()
        coordinator.triggerBranchConfirm()

        assertEquals(ConsoleScreen.IN_FLIGHT, coordinator.activeScreen)
        assertEquals(FlightStage.IDLE, coordinator.flightState.stage)
        assertEquals("Upload is blocked until the checklist is approved.", coordinator.preflight.warning)
        assertEquals("Branch confirm is only available during in-flight transit.", coordinator.transit.partialWarning)
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
