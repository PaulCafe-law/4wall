package com.yourorg.buildingdrone.data

import com.yourorg.buildingdrone.core.GeoPoint
import com.yourorg.buildingdrone.domain.semantic.BranchDecision
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MissionBundleTest {
    @Test
    fun demoMissionBundle_isValid() {
        val bundle = demoMissionBundle()

        assertEquals("demo-mission-001", bundle.missionId)
        assertEquals(1, bundle.corridorSegments.size)
        assertEquals(1, bundle.verificationPoints.size)
        assertEquals(1, bundle.inspectionViewpoints.size)
        assertTrue(bundle.verificationPoints.first().expectedOptions.contains(BranchDecision.LEFT))
    }

    @Test(expected = IllegalArgumentException::class)
    fun corridorSegment_requiresAtLeastTwoPoints() {
        CorridorSegment(
            segmentId = "bad-segment",
            polyline = listOf(GeoPoint(0.0, 0.0)),
            halfWidthMeters = 8.0,
            suggestedAltitudeMeters = 30.0,
            suggestedSpeedMetersPerSecond = 4.0
        )
    }
}
