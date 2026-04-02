package com.yourorg.buildingdrone.domain.statemachine

import com.yourorg.buildingdrone.domain.safety.SafetyDecision
import com.yourorg.buildingdrone.domain.safety.SafetySnapshot
import com.yourorg.buildingdrone.domain.safety.SafetySupervisor

class FlightReducer(
    private val transitionGuard: TransitionGuard,
    private val safetySupervisor: SafetySupervisor
) {
    fun reduce(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext = TransitionContext()
    ): FlightState {
        if (event == FlightEventType.AUTH_EXPIRED) {
            return state.copy(
                authValid = false,
                pendingEventUploads = context.pendingEventUploads ?: state.pendingEventUploads,
                pendingTelemetryUploads = context.pendingTelemetryUploads ?: state.pendingTelemetryUploads,
                lastEvent = event,
                statusNote = "Server authentication expired. New server-dependent actions are blocked."
            )
        }

        if (event == FlightEventType.AUTH_REFRESHED) {
            return state.copy(
                authValid = true,
                pendingEventUploads = context.pendingEventUploads ?: state.pendingEventUploads,
                pendingTelemetryUploads = context.pendingTelemetryUploads ?: state.pendingTelemetryUploads,
                lastEvent = event,
                statusNote = "Server authentication refreshed."
            )
        }

        if (event == FlightEventType.UPLOAD_BACKLOG_UPDATED) {
            val pendingEvents = context.pendingEventUploads ?: state.pendingEventUploads
            val pendingTelemetry = context.pendingTelemetryUploads ?: state.pendingTelemetryUploads
            return state.copy(
                authValid = context.authValid ?: state.authValid,
                pendingEventUploads = pendingEvents,
                pendingTelemetryUploads = pendingTelemetry,
                lastEvent = event,
                statusNote = when {
                    pendingEvents + pendingTelemetry == 0 -> "Flight uploads are caught up."
                    else -> "Uploads are queued locally and will retry later."
                }
            )
        }

        val safetyDecision = safetySupervisor.evaluate(
            event = event,
            snapshot = SafetySnapshot(
                batteryCritical = context.batteryCritical,
                frameStreamHealthy = context.frameStreamHealthy,
                appHealthy = context.appHealthy,
                gpsHealthy = context.gpsReady,
                deviceHealthBlocking = context.deviceHealthBlocking
            )
        )

        if (event == FlightEventType.USER_TAKEOVER_REQUESTED && state.stage != FlightStage.MANUAL_OVERRIDE) {
            return state.toStage(
                target = FlightStage.MANUAL_OVERRIDE,
                event = event,
                context = context,
                reason = "Manual takeover requested"
            )
        }

        if ((event == FlightEventType.USER_RTH_REQUESTED || safetyDecision == SafetyDecision.RTH) &&
            state.stage != FlightStage.RTH &&
            state.stage != FlightStage.LANDING
        ) {
            return state.toStage(
                target = FlightStage.RTH,
                event = event,
                context = context,
                reason = "Return-to-home engaged"
            ).advanceTransientStages(event, context)
        }

        if ((event == FlightEventType.USER_HOLD_REQUESTED || safetyDecision == SafetyDecision.HOLD) &&
            state.stage != FlightStage.HOLD
        ) {
            return state.toStage(
                target = FlightStage.HOLD,
                event = event,
                context = context,
                reason = state.holdReasonFor(event, context)
            )
        }

        val candidate = when (state.stage) {
            FlightStage.IDLE -> reduceFromIdle(state, event, context)
            FlightStage.PRECHECK -> reduceFromPrecheck(state, event, context)
            FlightStage.MISSION_READY -> reduceFromMissionReady(state, event, context)
            FlightStage.TAKEOFF -> reduceFromTakeoff(state, event, context)
            FlightStage.TRANSIT -> reduceFromTransit(state, event, context)
            FlightStage.BRANCH_VERIFY -> reduceFromBranchVerify(state, event, context)
            FlightStage.LOCAL_AVOID -> reduceFromLocalAvoid(state, event, context)
            FlightStage.APPROACH_VIEWPOINT -> reduceFromApproach(state, event, context)
            FlightStage.VIEW_ALIGN -> reduceFromViewAlign(state, event, context)
            FlightStage.CAPTURE -> reduceFromCapture(state, event, context)
            FlightStage.HOLD -> reduceFromHold(state, event, context)
            FlightStage.MANUAL_OVERRIDE -> reduceFromManualOverride(state, event, context)
            FlightStage.RTH -> reduceFromRth(state, event, context)
            FlightStage.LANDING -> reduceFromLanding(state, event, context)
            FlightStage.COMPLETED,
            FlightStage.ABORTED -> state.copy(lastEvent = event)
        }

        return candidate.advanceTransientStages(event, context)
    }

    private fun reduceFromIdle(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when (event) {
        FlightEventType.MISSION_SELECTED -> state.toStage(
            target = FlightStage.PRECHECK,
            event = event,
            context = context,
            note = "Mission selected"
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromPrecheck(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when (event) {
        FlightEventType.MISSION_BUNDLE_DOWNLOADED -> state.copy(
            missionBundleLoaded = true,
            lastEvent = event,
            statusNote = "Mission bundle downloaded"
        )

        FlightEventType.MISSION_BUNDLE_VERIFIED -> state.copy(
            missionBundleLoaded = true,
            missionBundleVerified = true,
            lastEvent = event,
            statusNote = "Mission bundle verified"
        )

        FlightEventType.MISSION_BUNDLE_INVALID -> state.copy(
            missionBundleLoaded = true,
            missionBundleVerified = false,
            lastEvent = event,
            statusNote = "Mission bundle invalid"
        )

        FlightEventType.PREFLIGHT_OK -> state.toStage(
            target = FlightStage.MISSION_READY,
            event = event,
            context = context.copy(
                missionBundleLoaded = context.missionBundleLoaded || state.missionBundleLoaded,
                missionBundleVerified = context.missionBundleVerified || state.missionBundleVerified,
                preflightReady = true
            ),
            note = "Preflight passed"
        ).let { next ->
            if (next.stage == FlightStage.MISSION_READY) {
                next.copy(preflightReady = true)
            } else {
                next
            }
        }

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromMissionReady(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when (event) {
        FlightEventType.MISSION_UPLOADED -> state.toStage(
            target = FlightStage.TAKEOFF,
            event = event,
            context = context.copy(
                missionUploaded = true,
                preflightReady = context.preflightReady || state.preflightReady
            ),
            note = "Mission uploaded"
        ).copy(missionUploaded = true)

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromTakeoff(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when (event) {
        FlightEventType.VERIFICATION_POINT_REACHED -> state.toStage(
            target = FlightStage.BRANCH_VERIFY,
            event = event,
            context = context,
            note = "Verification point reached"
        )

        FlightEventType.INSPECTION_ZONE_REACHED -> state.toStage(
            target = FlightStage.APPROACH_VIEWPOINT,
            event = event,
            context = context,
            note = "Inspection zone reached"
        )

        FlightEventType.OBSTACLE_WARN -> state.toStage(
            target = FlightStage.LOCAL_AVOID,
            event = event,
            context = context,
            note = "Local avoidance entered"
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromTransit(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when (event) {
        FlightEventType.VERIFICATION_POINT_REACHED -> state.toStage(
            target = FlightStage.BRANCH_VERIFY,
            event = event,
            context = context,
            note = "Branch verification started"
        )

        FlightEventType.INSPECTION_ZONE_REACHED -> state.toStage(
            target = FlightStage.APPROACH_VIEWPOINT,
            event = event,
            context = context,
            note = "Inspection approach started"
        )

        FlightEventType.OBSTACLE_WARN -> state.toStage(
            target = FlightStage.LOCAL_AVOID,
            event = event,
            context = context,
            note = "Local avoid active"
        )

        FlightEventType.CORRIDOR_DEVIATION_WARN -> state.copy(
            lastEvent = event,
            statusNote = "Corridor deviation warning"
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromBranchVerify(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when (event) {
        FlightEventType.BRANCH_VERIFY_LEFT,
        FlightEventType.BRANCH_VERIFY_RIGHT,
        FlightEventType.BRANCH_VERIFY_STRAIGHT -> state.toStage(
            target = FlightStage.TRANSIT,
            event = event,
            context = context,
            note = "Branch confirmed"
        )

        FlightEventType.BRANCH_VERIFY_UNKNOWN,
        FlightEventType.BRANCH_VERIFY_TIMEOUT,
        FlightEventType.FRAME_STREAM_DROPPED,
        FlightEventType.SEMANTIC_TIMEOUT -> state.toStage(
            target = FlightStage.HOLD,
            event = event,
            context = context,
            reason = state.holdReasonFor(event, context)
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromLocalAvoid(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when {
        context.obstacleCleared -> state.toStage(
            target = FlightStage.TRANSIT,
            event = event,
            context = context,
            note = "Obstacle cleared, resuming transit"
        )

        event == FlightEventType.VERIFICATION_POINT_REACHED -> state.toStage(
            target = FlightStage.BRANCH_VERIFY,
            event = event,
            context = context,
            note = "Avoid complete at verification point"
        )

        event == FlightEventType.INSPECTION_ZONE_REACHED -> state.toStage(
            target = FlightStage.APPROACH_VIEWPOINT,
            event = event,
            context = context,
            note = "Avoid complete at inspection zone"
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromApproach(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when (event) {
        FlightEventType.VIEW_ALIGN_OK -> state.toStage(
            target = FlightStage.VIEW_ALIGN,
            event = event,
            context = context,
            note = "View alignment entered"
        )

        FlightEventType.VIEW_ALIGN_TIMEOUT,
        FlightEventType.FRAME_STREAM_DROPPED -> state.toStage(
            target = FlightStage.HOLD,
            event = event,
            context = context,
            reason = state.holdReasonFor(event, context)
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromViewAlign(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when (event) {
        FlightEventType.VIEW_ALIGN_OK -> state.toStage(
            target = FlightStage.CAPTURE,
            event = event,
            context = context,
            note = "Capture started"
        )

        FlightEventType.VIEW_ALIGN_TIMEOUT,
        FlightEventType.FRAME_STREAM_DROPPED -> state.toStage(
            target = FlightStage.HOLD,
            event = event,
            context = context,
            reason = state.holdReasonFor(event, context)
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromCapture(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when {
        context.captureComplete && context.hasRemainingViewpoints -> state.toStage(
            target = FlightStage.TRANSIT,
            event = event,
            context = context,
            note = "Capture complete, continuing to next viewpoint"
        )

        context.captureComplete -> state.toStage(
            target = FlightStage.HOLD,
            event = event,
            context = context,
            reason = "Capture complete, awaiting operator decision"
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromHold(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when (event) {
        FlightEventType.USER_RESUME_REQUESTED -> state.resumeFromHold(event, context)
        FlightEventType.USER_RTH_REQUESTED -> state.toStage(
            target = FlightStage.RTH,
            event = event,
            context = context,
            reason = "Return-to-home requested from hold"
        )

        FlightEventType.USER_TAKEOVER_REQUESTED -> state.toStage(
            target = FlightStage.MANUAL_OVERRIDE,
            event = event,
            context = context,
            reason = "Manual takeover from hold"
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromManualOverride(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when {
        context.manualOverrideAborted -> state.toStage(
            target = FlightStage.ABORTED,
            event = event,
            context = context,
            reason = "Mission aborted in manual override"
        )

        context.manualOverrideComplete -> state.toStage(
            target = FlightStage.COMPLETED,
            event = event,
            context = context,
            note = "Manual override completed"
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromRth(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = if (context.rthArrived) {
        state.toStage(
            target = FlightStage.LANDING,
            event = event,
            context = context,
            note = "RTH arrived, landing"
        )
    } else {
        state.copy(lastEvent = event)
    }

    private fun reduceFromLanding(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = if (context.landingComplete) {
        state.toStage(
            target = FlightStage.COMPLETED,
            event = event,
            context = context,
            note = "Landing complete"
        )
    } else {
        state.copy(lastEvent = event)
    }

    private fun FlightState.advanceTransientStages(
        event: FlightEventType,
        context: TransitionContext
    ): FlightState {
        var current = this

        if (current.stage == FlightStage.TAKEOFF && context.takeoffComplete) {
            current = current.toStage(FlightStage.TRANSIT, event, context, note = "Takeoff complete, entering transit")
        }
        if (current.stage == FlightStage.RTH && context.rthArrived) {
            current = current.toStage(FlightStage.LANDING, event, context, note = "RTH arrived")
        }
        if (current.stage == FlightStage.LANDING && context.landingComplete) {
            current = current.toStage(FlightStage.COMPLETED, event, context, note = "Mission complete")
        }
        if (current.stage == FlightStage.MANUAL_OVERRIDE && context.manualOverrideAborted) {
            current = current.toStage(FlightStage.ABORTED, event, context, reason = "Manual abort")
        }
        if (current.stage == FlightStage.MANUAL_OVERRIDE && context.manualOverrideComplete) {
            current = current.toStage(FlightStage.COMPLETED, event, context, note = "Manual flight completed")
        }

        return current
    }

    private fun FlightState.resumeFromHold(
        event: FlightEventType,
        context: TransitionContext
    ): FlightState {
        val target = lastAutonomousStage ?: FlightStage.TRANSIT
        return toStage(
            target = target,
            event = event,
            context = context,
            note = "Operator resumed autonomous flow"
        )
    }

    private fun FlightState.toStage(
        target: FlightStage,
        event: FlightEventType,
        context: TransitionContext,
        reason: String? = null,
        note: String? = null
    ): FlightState {
        if (!transitionGuard.canTransition(this, event, target, context)) {
            return copy(lastEvent = event)
        }
        return copy(
            stage = target,
            missionBundleLoaded = missionBundleLoaded || context.missionBundleLoaded,
            missionBundleVerified = missionBundleVerified || context.missionBundleVerified,
            preflightReady = preflightReady || context.preflightReady,
            missionUploaded = missionUploaded || context.missionUploaded,
            authValid = context.authValid ?: authValid,
            pendingEventUploads = context.pendingEventUploads ?: pendingEventUploads,
            pendingTelemetryUploads = context.pendingTelemetryUploads ?: pendingTelemetryUploads,
            lastEvent = event,
            holdReason = if (target == FlightStage.HOLD || target == FlightStage.ABORTED) reason else null,
            lastAutonomousStage = when (target) {
                FlightStage.HOLD,
                FlightStage.MANUAL_OVERRIDE,
                FlightStage.RTH,
                FlightStage.LANDING,
                FlightStage.COMPLETED,
                FlightStage.ABORTED -> lastAutonomousStage ?: stage
                else -> target
            },
            statusNote = note ?: reason
        )
    }

    private fun FlightState.holdReasonFor(
        event: FlightEventType,
        context: TransitionContext
    ): String {
        return when {
            event == FlightEventType.BRANCH_VERIFY_TIMEOUT -> "Branch confirmation timed out"
            event == FlightEventType.BRANCH_VERIFY_UNKNOWN -> "Branch confirmation is uncertain"
            event == FlightEventType.OBSTACLE_HARD_STOP -> "Obstacle requires a hard stop"
            event == FlightEventType.CORRIDOR_DEVIATION_HARD -> "Aircraft left the corridor envelope"
            event == FlightEventType.GPS_LOST || !context.gpsReady -> "GPS is below the safe threshold"
            event == FlightEventType.APP_HEALTH_BAD || !context.appHealthy -> "App health is not safe for autonomy"
            event == FlightEventType.FRAME_STREAM_DROPPED || !context.frameStreamHealthy -> "Camera frame stream is unavailable"
            event == FlightEventType.SEMANTIC_TIMEOUT -> "Semantic verification timed out"
            event == FlightEventType.DEVICE_HEALTH_BLOCKING || context.deviceHealthBlocking -> "Device health is blocking flight"
            else -> "Aircraft is holding for operator input"
        }
    }
}

fun FlightStage.toDisplayLabel(): String = when (this) {
    FlightStage.IDLE -> "Idle"
    FlightStage.PRECHECK -> "Preflight"
    FlightStage.MISSION_READY -> "Mission Ready"
    FlightStage.TAKEOFF -> "Takeoff"
    FlightStage.TRANSIT -> "Transit"
    FlightStage.BRANCH_VERIFY -> "Branch Confirm"
    FlightStage.LOCAL_AVOID -> "Local Avoid"
    FlightStage.APPROACH_VIEWPOINT -> "Approach"
    FlightStage.VIEW_ALIGN -> "Align View"
    FlightStage.CAPTURE -> "Capture"
    FlightStage.HOLD -> "Hold"
    FlightStage.MANUAL_OVERRIDE -> "Takeover"
    FlightStage.RTH -> "RTH"
    FlightStage.LANDING -> "Landing"
    FlightStage.COMPLETED -> "Completed"
    FlightStage.ABORTED -> "Aborted"
}
