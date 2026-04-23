package com.yourorg.buildingdrone.domain.safety

import com.yourorg.buildingdrone.domain.operations.OperationProfile
import com.yourorg.buildingdrone.domain.statemachine.FlightEventType

enum class SafetyDecision {
    NONE,
    HOLD,
    RTH,
    LAND
}

data class SafetySnapshot(
    val batteryCritical: Boolean = false,
    val frameStreamHealthy: Boolean = true,
    val appHealthy: Boolean = true,
    val gpsHealthy: Boolean = true,
    val gpsWeak: Boolean = false,
    val rcSignalHealthy: Boolean = true,
    val deviceHealthBlocking: Boolean = false,
    val operationProfile: OperationProfile = OperationProfile.OUTDOOR_GPS_REQUIRED
)

interface HoldPolicy {
    fun shouldHold(event: FlightEventType, snapshot: SafetySnapshot): Boolean
}

interface RthPolicy {
    fun shouldReturnHome(event: FlightEventType, snapshot: SafetySnapshot): Boolean
}

interface LandingPolicy {
    fun shouldLand(event: FlightEventType, snapshot: SafetySnapshot): Boolean
}

interface SafetySupervisor {
    fun evaluate(event: FlightEventType, snapshot: SafetySnapshot): SafetyDecision
}

class DefaultHoldPolicy : HoldPolicy {
    override fun shouldHold(event: FlightEventType, snapshot: SafetySnapshot): Boolean {
        val gpsShouldHold = snapshot.operationProfile == OperationProfile.OUTDOOR_GPS_REQUIRED &&
            (event == FlightEventType.GPS_WEAK || event == FlightEventType.GPS_LOST || !snapshot.gpsHealthy || snapshot.gpsWeak)

        return event in setOf(
            FlightEventType.BRANCH_VERIFY_TIMEOUT,
            FlightEventType.BRANCH_VERIFY_UNKNOWN,
            FlightEventType.OBSTACLE_HARD_STOP,
            FlightEventType.CORRIDOR_DEVIATION_HARD,
            FlightEventType.RC_SIGNAL_DEGRADED,
            FlightEventType.RC_SIGNAL_LOST,
            FlightEventType.APP_HEALTH_BAD,
            FlightEventType.FRAME_STREAM_DROPPED,
            FlightEventType.SEMANTIC_TIMEOUT,
            FlightEventType.DEVICE_HEALTH_BLOCKING
        ) ||
            gpsShouldHold ||
            !snapshot.frameStreamHealthy ||
            !snapshot.appHealthy ||
            !snapshot.rcSignalHealthy ||
            snapshot.deviceHealthBlocking
    }
}

class DefaultRthPolicy : RthPolicy {
    override fun shouldReturnHome(event: FlightEventType, snapshot: SafetySnapshot): Boolean {
        if (snapshot.operationProfile == OperationProfile.INDOOR_NO_GPS) {
            return false
        }
        return event == FlightEventType.BATTERY_CRITICAL || snapshot.batteryCritical
    }
}

class DefaultLandingPolicy : LandingPolicy {
    override fun shouldLand(event: FlightEventType, snapshot: SafetySnapshot): Boolean {
        if (snapshot.operationProfile != OperationProfile.INDOOR_NO_GPS) {
            return false
        }
        return event == FlightEventType.BATTERY_CRITICAL || snapshot.batteryCritical
    }
}

class DefaultSafetySupervisor(
    private val holdPolicy: HoldPolicy,
    private val rthPolicy: RthPolicy,
    private val landingPolicy: LandingPolicy = DefaultLandingPolicy()
) : SafetySupervisor {
    override fun evaluate(event: FlightEventType, snapshot: SafetySnapshot): SafetyDecision {
        return when {
            landingPolicy.shouldLand(event, snapshot) -> SafetyDecision.LAND
            rthPolicy.shouldReturnHome(event, snapshot) -> SafetyDecision.RTH
            holdPolicy.shouldHold(event, snapshot) -> SafetyDecision.HOLD
            else -> SafetyDecision.NONE
        }
    }
}
