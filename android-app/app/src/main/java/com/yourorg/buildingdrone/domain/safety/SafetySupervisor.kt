package com.yourorg.buildingdrone.domain.safety

import com.yourorg.buildingdrone.domain.statemachine.FlightEventType

enum class SafetyDecision {
    NONE,
    HOLD,
    RTH
}

data class SafetySnapshot(
    val batteryCritical: Boolean = false,
    val frameStreamHealthy: Boolean = true,
    val appHealthy: Boolean = true
)

interface HoldPolicy {
    fun shouldHold(event: FlightEventType, snapshot: SafetySnapshot): Boolean
}

interface RthPolicy {
    fun shouldReturnHome(event: FlightEventType, snapshot: SafetySnapshot): Boolean
}

interface SafetySupervisor {
    fun evaluate(event: FlightEventType, snapshot: SafetySnapshot): SafetyDecision
}

class DefaultHoldPolicy : HoldPolicy {
    override fun shouldHold(event: FlightEventType, snapshot: SafetySnapshot): Boolean {
        return event in setOf(
            FlightEventType.BRANCH_VERIFY_TIMEOUT,
            FlightEventType.BRANCH_VERIFY_UNKNOWN,
            FlightEventType.OBSTACLE_HARD_STOP,
            FlightEventType.CORRIDOR_DEVIATION_HARD,
            FlightEventType.GPS_LOST,
            FlightEventType.APP_HEALTH_BAD
        ) || !snapshot.frameStreamHealthy || !snapshot.appHealthy
    }
}

class DefaultRthPolicy : RthPolicy {
    override fun shouldReturnHome(event: FlightEventType, snapshot: SafetySnapshot): Boolean {
        return event == FlightEventType.BATTERY_CRITICAL || snapshot.batteryCritical
    }
}

class DefaultSafetySupervisor(
    private val holdPolicy: HoldPolicy,
    private val rthPolicy: RthPolicy
) : SafetySupervisor {
    override fun evaluate(event: FlightEventType, snapshot: SafetySnapshot): SafetyDecision {
        return when {
            rthPolicy.shouldReturnHome(event, snapshot) -> SafetyDecision.RTH
            holdPolicy.shouldHold(event, snapshot) -> SafetyDecision.HOLD
            else -> SafetyDecision.NONE
        }
    }
}
