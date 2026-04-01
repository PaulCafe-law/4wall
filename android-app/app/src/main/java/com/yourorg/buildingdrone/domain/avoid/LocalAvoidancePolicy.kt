package com.yourorg.buildingdrone.domain.avoid

enum class LocalAvoidanceAction {
    NONE,
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
    ): LocalAvoidanceAction {
        return when {
            hardStop -> LocalAvoidanceAction.HOLD
            obstacleDistanceMeters == null -> LocalAvoidanceAction.NONE
            obstacleDistanceMeters < 2.0 -> LocalAvoidanceAction.HOLD
            obstacleDistanceMeters < 4.0 -> LocalAvoidanceAction.SLOW_DOWN
            preferLeft -> LocalAvoidanceAction.NUDGE_LEFT
            else -> LocalAvoidanceAction.NUDGE_RIGHT
        }
    }
}
