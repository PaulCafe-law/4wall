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
    MISSION_BUNDLE_VERIFIED,
    MISSION_BUNDLE_INVALID,
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
    FRAME_STREAM_DROPPED,
    SEMANTIC_TIMEOUT,
    USER_HOLD_REQUESTED,
    USER_RESUME_REQUESTED,
    USER_RTH_REQUESTED,
    USER_TAKEOVER_REQUESTED,
    AUTH_EXPIRED,
    AUTH_REFRESHED,
    UPLOAD_BACKLOG_UPDATED,
    BATTERY_CRITICAL,
    GPS_LOST,
    DEVICE_HEALTH_BLOCKING,
    APP_HEALTH_BAD
}

data class FlightState(
    val stage: FlightStage = FlightStage.IDLE,
    val missionId: String? = null,
    val missionBundleLoaded: Boolean = false,
    val missionBundleVerified: Boolean = false,
    val preflightReady: Boolean = false,
    val missionUploaded: Boolean = false,
    val authValid: Boolean = true,
    val pendingEventUploads: Int = 0,
    val pendingTelemetryUploads: Int = 0,
    val lastEvent: FlightEventType? = null,
    val holdReason: String? = null,
    val lastAutonomousStage: FlightStage? = null,
    val statusNote: String? = null,
    val demoMode: Boolean = true
)

data class TransitionContext(
    val missionBundleLoaded: Boolean = false,
    val missionBundleVerified: Boolean = false,
    val preflightReady: Boolean = false,
    val missionUploaded: Boolean = false,
    val authValid: Boolean? = null,
    val pendingEventUploads: Int? = null,
    val pendingTelemetryUploads: Int? = null,
    val frameStreamHealthy: Boolean = true,
    val appHealthy: Boolean = true,
    val gpsReady: Boolean = true,
    val deviceHealthBlocking: Boolean = false,
    val batteryCritical: Boolean = false,
    val takeoffComplete: Boolean = false,
    val obstacleCleared: Boolean = false,
    val captureComplete: Boolean = false,
    val hasRemainingViewpoints: Boolean = false,
    val rthArrived: Boolean = false,
    val landingComplete: Boolean = false,
    val manualOverrideComplete: Boolean = false,
    val manualOverrideAborted: Boolean = false
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
            FlightStage.PRECHECK -> from.stage == FlightStage.IDLE
            FlightStage.MISSION_READY -> (context.missionBundleLoaded || from.missionBundleLoaded) &&
                (context.missionBundleVerified || from.missionBundleVerified)
            FlightStage.TAKEOFF -> (context.missionUploaded || from.missionUploaded) &&
                (context.preflightReady || from.preflightReady)
            FlightStage.TRANSIT -> from.missionUploaded || context.missionUploaded
            FlightStage.BRANCH_VERIFY -> from.missionUploaded || context.missionUploaded
            FlightStage.LOCAL_AVOID -> from.missionUploaded || context.missionUploaded
            FlightStage.APPROACH_VIEWPOINT -> from.missionUploaded || context.missionUploaded
            FlightStage.VIEW_ALIGN -> from.stage == FlightStage.APPROACH_VIEWPOINT
            FlightStage.CAPTURE -> from.stage == FlightStage.VIEW_ALIGN
            FlightStage.HOLD -> true
            FlightStage.MANUAL_OVERRIDE -> true
            FlightStage.RTH -> true
            FlightStage.LANDING -> from.stage == FlightStage.RTH || context.rthArrived
            FlightStage.COMPLETED -> from.stage == FlightStage.LANDING || (from.stage == FlightStage.MANUAL_OVERRIDE && context.manualOverrideComplete)
            FlightStage.ABORTED -> from.stage == FlightStage.MANUAL_OVERRIDE && context.manualOverrideAborted
            FlightStage.IDLE -> true
        }
    }
}
