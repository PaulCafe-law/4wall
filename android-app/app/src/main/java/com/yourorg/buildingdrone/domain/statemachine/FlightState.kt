package com.yourorg.buildingdrone.domain.statemachine

enum class FlightStage {
    IDLE,
    PRECHECK,
    MISSION_READY,
    TAKEOFF,
    TRANSIT,
    BRANCH_VERIFY,
    LOCAL_AVOID,
    APPROACH_VIEWPOINT,
    VIEW_ALIGN,
    CAPTURE,
    HOLD,
    MANUAL_OVERRIDE,
    RTH,
    LANDING,
    COMPLETED,
    ABORTED
}

enum class FlightEventType {
    MISSION_SELECTED,
    MISSION_BUNDLE_DOWNLOADED,
    MISSION_UPLOADED,
    PREFLIGHT_OK,
    CORRIDOR_DEVIATION_WARN,
    CORRIDOR_DEVIATION_HARD,
    VERIFICATION_POINT_REACHED,
    INSPECTION_ZONE_REACHED,
    OBSTACLE_WARN,
    OBSTACLE_HARD_STOP,
    BRANCH_VERIFY_LEFT,
    BRANCH_VERIFY_RIGHT,
    BRANCH_VERIFY_STRAIGHT,
    BRANCH_VERIFY_UNKNOWN,
    BRANCH_VERIFY_TIMEOUT,
    VIEW_ALIGN_OK,
    VIEW_ALIGN_TIMEOUT,
    USER_HOLD_REQUESTED,
    USER_RTH_REQUESTED,
    USER_TAKEOVER_REQUESTED,
    BATTERY_CRITICAL,
    GPS_LOST,
    APP_HEALTH_BAD
}

data class FlightState(
    val stage: FlightStage = FlightStage.IDLE,
    val missionId: String? = null,
    val missionBundleLoaded: Boolean = false,
    val missionUploaded: Boolean = false,
    val lastEvent: FlightEventType? = null,
    val holdReason: String? = null,
    val demoMode: Boolean = true
)

data class TransitionContext(
    val missionBundleLoaded: Boolean = false,
    val missionUploaded: Boolean = false,
    val frameStreamHealthy: Boolean = true,
    val appHealthy: Boolean = true,
    val batteryCritical: Boolean = false
)

interface TransitionGuard {
    fun canTransition(
        from: FlightState,
        event: FlightEventType,
        to: FlightStage,
        context: TransitionContext
    ): Boolean
}

class DefaultTransitionGuard : TransitionGuard {
    override fun canTransition(
        from: FlightState,
        event: FlightEventType,
        to: FlightStage,
        context: TransitionContext
    ): Boolean {
        return when (to) {
            FlightStage.MISSION_READY -> context.missionBundleLoaded || from.missionBundleLoaded
            FlightStage.TAKEOFF -> context.missionUploaded || from.missionUploaded
            FlightStage.TRANSIT,
            FlightStage.BRANCH_VERIFY,
            FlightStage.LOCAL_AVOID,
            FlightStage.APPROACH_VIEWPOINT,
            FlightStage.VIEW_ALIGN,
            FlightStage.CAPTURE -> from.missionUploaded || context.missionUploaded
            else -> true
        }
    }
}
