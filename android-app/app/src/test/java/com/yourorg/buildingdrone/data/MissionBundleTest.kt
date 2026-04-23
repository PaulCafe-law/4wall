package com.yourorg.buildingdrone.data

import com.yourorg.buildingdrone.core.GeoPoint
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MissionBundleTest {
    @Test
    fun demoMissionBundle_isValidPatrolRoute() {
        val bundle = demoMissionBundle()

        assertEquals("demo-mission-001", bundle.missionId)
        assertEquals("outdoor_gps_patrol", bundle.operatingProfile.wireName)
        assertEquals("L", bundle.launchPoint.label)
        assertEquals(2, bundle.orderedWaypoints.size)
        assertTrue(bundle.implicitReturnToLaunch)
        assertEquals(
            listOf(1, 2),
            bundle.orderedWaypoints.map { it.sequence }
        )
        assertEquals(
            listOf(
                bundle.launchPoint.location,
                bundle.orderedWaypoints[0].location,
                bundle.orderedWaypoints[1].location,
                bundle.launchPoint.location
            ),
            bundle.closedLoopPath()
        )
        assertTrue(bundle.isArtifactComplete())
        assertTrue(bundle.isVerified())
    }

    @Test(expected = IllegalArgumentException::class)
    fun orderedWaypoint_requiresPositiveSequence() {
        OrderedWaypoint(
            waypointId = "bad-waypoint",
            sequence = 0,
            location = GeoPoint(0.0, 0.0)
        )
    }
}
