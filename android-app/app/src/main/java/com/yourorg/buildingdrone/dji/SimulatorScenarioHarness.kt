package com.yourorg.buildingdrone.dji

import com.yourorg.buildingdrone.core.GeoPoint
import com.yourorg.buildingdrone.domain.statemachine.FlightEventType
import com.yourorg.buildingdrone.domain.statemachine.FlightReducer
import com.yourorg.buildingdrone.domain.statemachine.FlightStage
import com.yourorg.buildingdrone.domain.statemachine.FlightState
import com.yourorg.buildingdrone.domain.statemachine.TransitionContext
import kotlinx.coroutines.delay

enum class SimulatorScenario {
    TRANSIT_BRANCH_HOLD_RTH,
    TRANSIT_INSPECTION_CAPTURE
}

data class SimulatorScenarioStep(
    val event: FlightEventType,
    val context: TransitionContext,
    val label: String
)

data class SimulatorScenarioReplay(
    val visitedStages: List<FlightStage>,
    val simulatorSamples: List<SimulatorStatus>,
    val finalState: FlightState,
    val enableSucceeded: Boolean = simulatorSamples.any { it.enabled },
    val listenerObserved: Boolean = simulatorSamples.any { it.enabled || it.location != null || it.altitudeMeters != 0.0 || it.satelliteCount > 0 },
    val enabledSampleObserved: Boolean = simulatorSamples.any { it.enabled },
    val disableSucceeded: Boolean = true,
    val failureReason: String? = null
)

class SimulatorScenarioHarness(
    private val simulatorAdapter: SimulatorAdapter,
    private val reducer: FlightReducer,
    private val enableObservationTimeoutMillis: Long = 1_000L,
    private val observationPollIntervalMillis: Long = 50L
) {
    suspend fun replay(
        initialLocation: GeoPoint,
        altitudeMeters: Double,
        initialState: FlightState,
        scenario: SimulatorScenario
    ): SimulatorScenarioReplay {
        val samples = mutableListOf<SimulatorStatus>()
        val listenerId = "scenario-harness"
        simulatorAdapter.addStateListener(listenerId) { samples += it }
        val baselineSamples = samples.size
        val enableSucceeded = simulatorAdapter.enable(initialLocation, altitudeMeters)
        if (enableSucceeded) {
            waitForObservation(samples, baselineSamples)
        }

        var state = initialState
        val visitedStages = mutableListOf(state.stage)
        stepsFor(scenario).forEach { step ->
            state = reducer.reduce(state, step.event, step.context)
            visitedStages += state.stage
        }

        val listenerSamples = samples.drop(baselineSamples)
        val listenerObserved = listenerSamples.isNotEmpty()
        val enabledSampleObserved = listenerSamples.any { it.enabled }
        val failureReason = when {
            !enableSucceeded -> simulatorAdapter.lastCommandError() ?: "Failed to enable the in-app simulator."
            !listenerObserved -> "Replay completed reducer transitions, but no MSDK simulator state update was observed."
            !enabledSampleObserved -> "Replay completed reducer transitions, but no enabled simulator sample was observed."
            else -> null
        }

        val disableSucceeded = try {
            simulatorAdapter.disable()
        } finally {
            simulatorAdapter.removeStateListener(listenerId)
        }
        return SimulatorScenarioReplay(
            visitedStages = visitedStages,
            simulatorSamples = samples.toList(),
            finalState = state,
            enableSucceeded = enableSucceeded,
            listenerObserved = listenerObserved,
            enabledSampleObserved = enabledSampleObserved,
            disableSucceeded = disableSucceeded,
            failureReason = failureReason
        )
    }

    private suspend fun waitForObservation(
        samples: List<SimulatorStatus>,
        baselineSamples: Int
    ) {
        val deadline = System.currentTimeMillis() + enableObservationTimeoutMillis
        while (samples.drop(baselineSamples).none { it.enabled } && System.currentTimeMillis() < deadline) {
            delay(observationPollIntervalMillis)
        }
    }

    private fun stepsFor(scenario: SimulatorScenario): List<SimulatorScenarioStep> {
        return when (scenario) {
            SimulatorScenario.TRANSIT_BRANCH_HOLD_RTH -> listOf(
                SimulatorScenarioStep(
                    event = FlightEventType.VERIFICATION_POINT_REACHED,
                    context = TransitionContext(missionUploaded = true),
                    label = "enter_branch_verify"
                ),
                SimulatorScenarioStep(
                    event = FlightEventType.BRANCH_VERIFY_TIMEOUT,
                    context = TransitionContext(missionUploaded = true),
                    label = "timeout_into_hold"
                ),
                SimulatorScenarioStep(
                    event = FlightEventType.USER_RTH_REQUESTED,
                    context = TransitionContext(missionUploaded = true),
                    label = "operator_rth"
                )
            )

            SimulatorScenario.TRANSIT_INSPECTION_CAPTURE -> listOf(
                SimulatorScenarioStep(
                    event = FlightEventType.INSPECTION_ZONE_REACHED,
                    context = TransitionContext(missionUploaded = true),
                    label = "enter_approach"
                ),
                SimulatorScenarioStep(
                    event = FlightEventType.VIEW_ALIGN_OK,
                    context = TransitionContext(missionUploaded = true),
                    label = "align_view"
                ),
                SimulatorScenarioStep(
                    event = FlightEventType.VIEW_ALIGN_OK,
                    context = TransitionContext(missionUploaded = true),
                    label = "enter_capture"
                ),
                SimulatorScenarioStep(
                    event = FlightEventType.VIEW_ALIGN_OK,
                    context = TransitionContext(
                        missionUploaded = true,
                        captureComplete = true,
                        hasRemainingViewpoints = false
                    ),
                    label = "capture_complete"
                )
            )
        }
    }
}
