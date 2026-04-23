package com.yourorg.buildingdrone.domain.avoid

/*
Bounded local avoider outputs
=============================
Only these outputs are allowed:
  SLOW_DOWN
  HOLD
  NUDGE_LEFT
  NUDGE_RIGHT
If there is no obstacle decision to make, the policy returns null.
*/
enum class LocalAvoidanceAction {
    SLOW_DOWN,
    HOLD,
    NUDGE_LEFT,
    NUDGE_RIGHT
}

class LocalAvoidancePolicy {
    fun chooseAction(
        obstacleDistanceMeters: Double?,
        hardStop: Boolean,
        preferLeft: Boolean
    ): LocalAvoidanceAction? {
        return when {
            hardStop -> LocalAvoidanceAction.HOLD
            obstacleDistanceMeters == null -> null
            obstacleDistanceMeters < 2.0 -> LocalAvoidanceAction.HOLD
            obstacleDistanceMeters < 4.0 -> LocalAvoidanceAction.SLOW_DOWN
            preferLeft -> LocalAvoidanceAction.NUDGE_LEFT
            else -> LocalAvoidanceAction.NUDGE_RIGHT
        }
    }
}
