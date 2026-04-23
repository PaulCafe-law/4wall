package com.yourorg.buildingdrone.domain.avoid

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LocalAvoidancePolicyTest {
    private val policy = LocalAvoidancePolicy()

    @Test
    fun returnsNullWhenNoObstacleDecisionExists() {
        assertNull(policy.chooseAction(obstacleDistanceMeters = null, hardStop = false, preferLeft = true))
    }

    @Test
    fun returnsOnlyBoundedActions() {
        assertEquals(LocalAvoidanceAction.HOLD, policy.chooseAction(obstacleDistanceMeters = 1.5, hardStop = false, preferLeft = true))
        assertEquals(LocalAvoidanceAction.SLOW_DOWN, policy.chooseAction(obstacleDistanceMeters = 3.0, hardStop = false, preferLeft = true))
        assertEquals(LocalAvoidanceAction.NUDGE_LEFT, policy.chooseAction(obstacleDistanceMeters = 8.0, hardStop = false, preferLeft = true))
        assertEquals(LocalAvoidanceAction.NUDGE_RIGHT, policy.chooseAction(obstacleDistanceMeters = 8.0, hardStop = false, preferLeft = false))
    }
}
