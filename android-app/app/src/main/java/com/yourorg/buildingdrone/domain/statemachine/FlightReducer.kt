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
        val safetyDecision = safetySupervisor.evaluate(
            event = event,
            snapshot = SafetySnapshot(
                batteryCritical = context.batteryCritical,
                frameStreamHealthy = context.frameStreamHealthy,
                appHealthy = context.appHealthy
            )
        )

        if (safetyDecision == SafetyDecision.RTH) {
            return state.transitionTo(FlightStage.RTH, event, "Battery critical")
        }
        if (safetyDecision == SafetyDecision.HOLD) {
            return state.transitionTo(FlightStage.HOLD, event, "Safety supervisor hold")
        }

        val candidate = when (event) {
            FlightEventType.MISSION_SELECTED -> state.copy(stage = FlightStage.PRECHECK)
            FlightEventType.MISSION_BUNDLE_DOWNLOADED -> state.copy(
                stage = FlightStage.PRECHECK,
                missionBundleLoaded = true
            )
            FlightEventType.PREFLIGHT_OK -> state.copy(stage = FlightStage.MISSION_READY)
            FlightEventType.MISSION_UPLOADED -> state.copy(
                stage = FlightStage.TAKEOFF,
                missionUploaded = true
            )
            FlightEventType.VERIFICATION_POINT_REACHED -> state.copy(stage = FlightStage.BRANCH_VERIFY)
            FlightEventType.INSPECTION_ZONE_REACHED -> state.copy(stage = FlightStage.APPROACH_VIEWPOINT)
            FlightEventType.OBSTACLE_WARN -> state.copy(stage = FlightStage.LOCAL_AVOID)
            FlightEventType.BRANCH_VERIFY_LEFT,
            FlightEventType.BRANCH_VERIFY_RIGHT,
            FlightEventType.BRANCH_VERIFY_STRAIGHT -> state.copy(stage = FlightStage.TRANSIT)
            FlightEventType.VIEW_ALIGN_OK -> state.copy(stage = FlightStage.CAPTURE)
            FlightEventType.USER_HOLD_REQUESTED -> state.copy(stage = FlightStage.HOLD, holdReason = "Operator requested hold")
            FlightEventType.USER_RTH_REQUESTED -> state.copy(stage = FlightStage.RTH)
            FlightEventType.USER_TAKEOVER_REQUESTED -> state.copy(stage = FlightStage.MANUAL_OVERRIDE)
            else -> state
        }

        val targetStage = candidate.stage
        return if (transitionGuard.canTransition(state, event, targetStage, context)) {
            candidate.copy(lastEvent = event)
        } else {
            state.copy(lastEvent = event)
        }
    }

    private fun FlightState.transitionTo(
        stage: FlightStage,
        event: FlightEventType,
        reason: String
    ): FlightState {
        return copy(stage = stage, lastEvent = event, holdReason = reason)
    }
}
