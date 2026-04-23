package com.yourorg.buildingdrone.domain.statemachine

import com.yourorg.buildingdrone.domain.operations.OperationProfile
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
        context: TransitionContext = TransitionContext(),
        operationProfile: OperationProfile = OperationProfile.OUTDOOR_GPS_REQUIRED
    ): FlightState {
        if (event == FlightEventType.AUTH_EXPIRED) {
            return state.copy(
                authValid = false,
                pendingEventUploads = context.pendingEventUploads ?: state.pendingEventUploads,
                pendingTelemetryUploads = context.pendingTelemetryUploads ?: state.pendingTelemetryUploads,
                lastEvent = event,
                statusNote = "Auth expired; keep local bundle and upload backlog until connectivity recovers."
            )
        }

        if (event == FlightEventType.AUTH_REFRESHED) {
            return state.copy(
                authValid = true,
                pendingEventUploads = context.pendingEventUploads ?: state.pendingEventUploads,
                pendingTelemetryUploads = context.pendingTelemetryUploads ?: state.pendingTelemetryUploads,
                lastEvent = event,
                statusNote = "Auth refreshed."
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
                statusNote = if (pendingEvents + pendingTelemetry == 0) {
                    "Upload backlog drained."
                } else {
                    "Upload backlog pending: events $pendingEvents / telemetry $pendingTelemetry."
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
                gpsWeak = context.gpsWeak,
                rcSignalHealthy = context.rcSignalHealthy,
                deviceHealthBlocking = context.deviceHealthBlocking,
                operationProfile = operationProfile
            )
        )

        if (event == FlightEventType.USER_TAKEOVER_REQUESTED && state.stage != FlightStage.MANUAL_OVERRIDE) {
            return state.toStage(
                target = FlightStage.MANUAL_OVERRIDE,
                event = event,
                context = context,
                reason = "Operator requested manual takeover."
            )
        }

        if ((event == FlightEventType.USER_LAND_REQUESTED || safetyDecision == SafetyDecision.LAND) &&
            state.stage != FlightStage.LANDING &&
            state.stage != FlightStage.COMPLETED
        ) {
            return state.toStage(
                target = FlightStage.LANDING,
                event = event,
                context = context,
                reason = "Landing requested."
            ).advanceTransientStages(event, context)
        }

        if ((event == FlightEventType.USER_RTH_REQUESTED || safetyDecision == SafetyDecision.RTH) &&
            state.stage != FlightStage.RTH &&
            state.stage != FlightStage.LANDING
        ) {
            return state.toStage(
                target = FlightStage.RTH,
                event = event,
                context = context,
                reason = "Return-to-home requested."
            ).advanceTransientStages(event, context)
        }

        if ((event == FlightEventType.USER_HOLD_REQUESTED || safetyDecision == SafetyDecision.HOLD) &&
            state.stage != FlightStage.HOLD
        ) {
            return state.toStage(
                target = FlightStage.HOLD,
                event = event,
                context = context,
                reason = state.holdReasonFor(event, context, operationProfile)
            )
        }

        val candidate = when (state.stage) {
            FlightStage.IDLE -> reduceFromIdle(state, event, context)
            FlightStage.PRECHECK -> reduceFromPrecheck(state, event, context)
            FlightStage.MISSION_READY -> reduceFromMissionReady(state, event, context)
            FlightStage.TAKEOFF -> reduceFromTakeoff(state, event, context)
            FlightStage.HOVER_READY -> reduceFromHoverReady(state, event, context)
            FlightStage.TRANSIT -> reduceFromTransit(state, event, context)
            FlightStage.BRANCH_VERIFY -> reduceFromBranchVerify(state, event, context, operationProfile)
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
            note = "Mission selected."
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
            statusNote = "Mission bundle downloaded."
        )

        FlightEventType.MISSION_BUNDLE_VERIFIED -> state.copy(
            missionBundleLoaded = true,
            missionBundleVerified = true,
            lastEvent = event,
            statusNote = "Mission bundle verified."
        )

        FlightEventType.MISSION_BUNDLE_INVALID -> state.copy(
            missionBundleLoaded = true,
            missionBundleVerified = false,
            lastEvent = event,
            statusNote = "Mission bundle verification failed."
        )

        FlightEventType.PREFLIGHT_OK -> state.toStage(
            target = FlightStage.MISSION_READY,
            event = event,
            context = context.copy(
                missionBundleLoaded = context.missionBundleLoaded || state.missionBundleLoaded,
                missionBundleVerified = context.missionBundleVerified || state.missionBundleVerified,
                preflightReady = true
            ),
            note = "Preflight passed."
        ).let { next ->
            if (next.stage == FlightStage.MISSION_READY) next.copy(preflightReady = true) else next
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
            note = "Mission uploaded."
        ).copy(missionUploaded = true)

        FlightEventType.APP_TAKEOFF_COMPLETED,
        FlightEventType.RC_HOVER_CONFIRMED -> state.toStage(
            target = FlightStage.HOVER_READY,
            event = event,
            context = context.copy(preflightReady = context.preflightReady || state.preflightReady),
            note = if (event == FlightEventType.APP_TAKEOFF_COMPLETED) {
                "App takeoff completed; stable hover confirmed."
            } else {
                "RC manual takeoff confirmed; stable hover ready."
            }
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromTakeoff(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when (event) {
        FlightEventType.APP_TAKEOFF_COMPLETED,
        FlightEventType.RC_HOVER_CONFIRMED -> state.toStage(
            target = FlightStage.HOVER_READY,
            event = event,
            context = context.copy(preflightReady = context.preflightReady || state.preflightReady),
            note = if (event == FlightEventType.APP_TAKEOFF_COMPLETED) {
                "App takeoff completed; stable hover confirmed."
            } else {
                "RC manual takeoff confirmed; stable hover ready."
            }
        )

        FlightEventType.VERIFICATION_POINT_REACHED -> state.toStage(
            target = FlightStage.BRANCH_VERIFY,
            event = event,
            context = context,
            note = "Reached verification point."
        )

        FlightEventType.INSPECTION_ZONE_REACHED -> state.toStage(
            target = FlightStage.APPROACH_VIEWPOINT,
            event = event,
            context = context,
            note = "Reached inspection zone."
        )

        FlightEventType.OBSTACLE_WARN -> state.toStage(
            target = FlightStage.LOCAL_AVOID,
            event = event,
            context = context,
            note = "Entering local avoid."
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromHoverReady(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when (event) {
        FlightEventType.MISSION_UPLOADED -> state.toStage(
            target = FlightStage.TRANSIT,
            event = event,
            context = context.copy(missionUploaded = true),
            note = "Stable hover confirmed; mission start authorized."
        ).copy(missionUploaded = true)

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
            note = "Entering branch verification."
        )

        FlightEventType.INSPECTION_ZONE_REACHED -> state.toStage(
            target = FlightStage.APPROACH_VIEWPOINT,
            event = event,
            context = context,
            note = "Approaching inspection viewpoint."
        )

        FlightEventType.OBSTACLE_WARN -> state.toStage(
            target = FlightStage.LOCAL_AVOID,
            event = event,
            context = context,
            note = "Local avoid active."
        )

        FlightEventType.CORRIDOR_DEVIATION_WARN -> state.copy(
            lastEvent = event,
            statusNote = "Corridor deviation warning."
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromBranchVerify(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext,
        operationProfile: OperationProfile
    ): FlightState = when (event) {
        FlightEventType.BRANCH_VERIFY_LEFT,
        FlightEventType.BRANCH_VERIFY_RIGHT,
        FlightEventType.BRANCH_VERIFY_STRAIGHT -> state.toStage(
            target = FlightStage.TRANSIT,
            event = event,
            context = context,
            note = "Branch decision confirmed."
        )

        FlightEventType.BRANCH_VERIFY_UNKNOWN,
        FlightEventType.BRANCH_VERIFY_TIMEOUT,
        FlightEventType.FRAME_STREAM_DROPPED,
        FlightEventType.SEMANTIC_TIMEOUT -> state.toStage(
            target = FlightStage.HOLD,
            event = event,
            context = context,
            reason = state.holdReasonFor(event, context, operationProfile)
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
            note = "Obstacle cleared; resuming transit."
        )

        event == FlightEventType.VERIFICATION_POINT_REACHED -> state.toStage(
            target = FlightStage.BRANCH_VERIFY,
            event = event,
            context = context,
            note = "Verification point reached while in local avoid."
        )

        event == FlightEventType.INSPECTION_ZONE_REACHED -> state.toStage(
            target = FlightStage.APPROACH_VIEWPOINT,
            event = event,
            context = context,
            note = "Inspection zone reached while in local avoid."
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
            note = "View aligned."
        )

        FlightEventType.VIEW_ALIGN_TIMEOUT,
        FlightEventType.FRAME_STREAM_DROPPED -> state.toStage(
            target = FlightStage.HOLD,
            event = event,
            context = context,
            reason = "Inspection approach lost visual alignment."
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
            note = "Capture authorized."
        )

        FlightEventType.VIEW_ALIGN_TIMEOUT,
        FlightEventType.FRAME_STREAM_DROPPED -> state.toStage(
            target = FlightStage.HOLD,
            event = event,
            context = context,
            reason = "View alignment no longer trusted."
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
            note = "Capture completed; remaining viewpoints pending."
        )

        context.captureComplete -> state.toStage(
            target = FlightStage.HOLD,
            event = event,
            context = context,
            reason = "Capture completed; waiting for operator decision."
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
            reason = "Leaving HOLD via RTH."
        )

        FlightEventType.USER_LAND_REQUESTED -> state.toStage(
            target = FlightStage.LANDING,
            event = event,
            context = context,
            reason = "Leaving HOLD via LAND."
        )

        FlightEventType.USER_TAKEOVER_REQUESTED -> state.toStage(
            target = FlightStage.MANUAL_OVERRIDE,
            event = event,
            context = context,
            reason = "Leaving HOLD via manual takeover."
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
            reason = "Manual override aborted."
        )

        context.manualOverrideComplete -> state.toStage(
            target = FlightStage.COMPLETED,
            event = event,
            context = context,
            note = "Manual override completed."
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
            note = "RTH arrived; landing."
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
            note = "Landing complete."
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
            current = current.toStage(FlightStage.HOVER_READY, event, context, note = "Takeoff complete; stable hover ready.")
        }
        if (current.stage == FlightStage.RTH && context.rthArrived) {
            current = current.toStage(FlightStage.LANDING, event, context, note = "RTH arrived; landing.")
        }
        if (current.stage == FlightStage.LANDING && context.landingComplete) {
            current = current.toStage(FlightStage.COMPLETED, event, context, note = "Flight completed.")
        }
        if (current.stage == FlightStage.MANUAL_OVERRIDE && context.manualOverrideAborted) {
            current = current.toStage(FlightStage.ABORTED, event, context, reason = "Manual override aborted.")
        }
        if (current.stage == FlightStage.MANUAL_OVERRIDE && context.manualOverrideComplete) {
            current = current.toStage(FlightStage.COMPLETED, event, context, note = "Manual override completed.")
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
            note = "Resuming from HOLD."
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
            holdReason = if (target == FlightStage.HOLD || target == FlightStage.ABORTED || target == FlightStage.LANDING) reason else null,
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
        context: TransitionContext,
        operationProfile: OperationProfile
    ): String {
        return when {
            event == FlightEventType.BRANCH_VERIFY_TIMEOUT -> "Branch confirm timed out."
            event == FlightEventType.BRANCH_VERIFY_UNKNOWN -> "Branch confirm remained unknown."
            event == FlightEventType.OBSTACLE_HARD_STOP -> "Obstacle hard stop triggered."
            event == FlightEventType.CORRIDOR_DEVIATION_HARD -> "Corridor deviation exceeded hard limit."
            operationProfile == OperationProfile.OUTDOOR_GPS_REQUIRED &&
                (event == FlightEventType.GPS_WEAK || context.gpsWeak) -> "GPS became weak; HOLD first."

            operationProfile == OperationProfile.OUTDOOR_GPS_REQUIRED &&
                (event == FlightEventType.GPS_LOST || !context.gpsReady) -> "GPS lost; HOLD first."

            event == FlightEventType.RC_SIGNAL_DEGRADED -> "RC signal degraded."
            event == FlightEventType.RC_SIGNAL_LOST || !context.rcSignalHealthy -> "RC signal lost."
            event == FlightEventType.APP_HEALTH_BAD || !context.appHealthy -> "App health became unsafe."
            event == FlightEventType.FRAME_STREAM_DROPPED || !context.frameStreamHealthy -> "Camera frame stream dropped."
            event == FlightEventType.SEMANTIC_TIMEOUT -> "Semantic confirmation timed out."
            event == FlightEventType.DEVICE_HEALTH_BLOCKING || context.deviceHealthBlocking -> "Device health became blocking."
            else -> "Unknown risk; HOLD first."
        }
    }
}

fun FlightStage.toDisplayLabel(): String = when (this) {
    FlightStage.IDLE -> "Idle"
    FlightStage.PRECHECK -> "Preflight"
    FlightStage.MISSION_READY -> "Mission Ready"
    FlightStage.TAKEOFF -> "Takeoff"
    FlightStage.HOVER_READY -> "Hover Ready"
    FlightStage.TRANSIT -> "Transit"
    FlightStage.BRANCH_VERIFY -> "Branch Confirm"
    FlightStage.LOCAL_AVOID -> "Local Avoid"
    FlightStage.APPROACH_VIEWPOINT -> "Approach Viewpoint"
    FlightStage.VIEW_ALIGN -> "View Align"
    FlightStage.CAPTURE -> "Capture"
    FlightStage.HOLD -> "HOLD"
    FlightStage.MANUAL_OVERRIDE -> "Manual Override"
    FlightStage.RTH -> "RTH"
    FlightStage.LANDING -> "Landing"
    FlightStage.COMPLETED -> "Completed"
    FlightStage.ABORTED -> "Aborted"
}
