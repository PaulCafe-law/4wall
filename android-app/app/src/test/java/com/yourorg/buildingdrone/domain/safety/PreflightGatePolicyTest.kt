package com.yourorg.buildingdrone.domain.safety

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PreflightGatePolicyTest {
    private val policy = DefaultPreflightGatePolicy()

    @Test
    fun allGreen_allowsTakeoff() {
        val evaluation = policy.evaluate(
            PreflightSnapshot(
                aircraftConnected = true,
                remoteControllerConnected = true,
                cameraStreamAvailable = true,
                availableStorageBytes = 1_000_000_000L,
                minimumStorageBytes = 100_000_000L,
                deviceHealthBlocking = false,
                flyZoneBlocking = false,
                gpsReady = true,
                missionBundlePresent = true,
                missionBundleVerified = true
            )
        )

        assertTrue(evaluation.canTakeoff)
        assertTrue(evaluation.blockers.isEmpty())
    }

    @Test
    fun exactBlockingGates_failConservatively() {
        val evaluation = policy.evaluate(
            PreflightSnapshot(
                aircraftConnected = false,
                remoteControllerConnected = false,
                cameraStreamAvailable = false,
                availableStorageBytes = 10L,
                minimumStorageBytes = 100L,
                deviceHealthBlocking = true,
                deviceHealthMessage = "IMU error",
                flyZoneBlocking = true,
                flyZoneMessage = "Restricted zone nearby",
                gpsReady = false,
                gpsDetail = "Only 4 satellites",
                missionBundlePresent = true,
                missionBundleVerified = false
            )
        )

        assertFalse(evaluation.canTakeoff)
        assertEquals(8, evaluation.blockers.size)
        assertTrue(evaluation.blockers.any { it.gateId == PreflightGateId.AIRCRAFT_CONNECTED })
        assertTrue(evaluation.blockers.any { it.gateId == PreflightGateId.REMOTE_CONTROLLER_CONNECTED })
        assertTrue(evaluation.blockers.any { it.gateId == PreflightGateId.CAMERA_STREAM })
        assertTrue(evaluation.blockers.any { it.gateId == PreflightGateId.STORAGE })
        assertTrue(evaluation.blockers.any { it.gateId == PreflightGateId.DEVICE_HEALTH })
        assertTrue(evaluation.blockers.any { it.gateId == PreflightGateId.FLY_ZONE })
        assertTrue(evaluation.blockers.any { it.gateId == PreflightGateId.GPS })
        assertTrue(evaluation.blockers.any { it.gateId == PreflightGateId.MISSION_BUNDLE })
    }
}
