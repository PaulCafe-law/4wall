package com.yourorg.buildingdrone.dji

import com.yourorg.buildingdrone.core.GeoPoint
import com.yourorg.buildingdrone.dji.real.DjiSimulatorAdapter
import com.yourorg.buildingdrone.domain.safety.DefaultHoldPolicy
import com.yourorg.buildingdrone.domain.safety.DefaultRthPolicy
import com.yourorg.buildingdrone.domain.safety.DefaultSafetySupervisor
import com.yourorg.buildingdrone.domain.statemachine.DefaultTransitionGuard
import com.yourorg.buildingdrone.domain.statemachine.FlightReducer
import com.yourorg.buildingdrone.domain.statemachine.FlightStage
import com.yourorg.buildingdrone.domain.statemachine.FlightState
import dji.v5.common.error.ErrorType
import dji.v5.common.error.IDJIError
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SimulatorHarnessTest {
    @Test
    fun simulatorHarness_replaysEnableDisableAndStateUpdates() = runTest {
        var publishedStatus = SimulatorStatus()
        val adapter = DjiSimulatorAdapter(
            gateway = object : DjiSimulatorAdapter.Gateway {
                private var listener: ((SimulatorStatus) -> Unit)? = null

                override fun isEnabled(): Boolean = publishedStatus.enabled

                override fun addListener(listener: (SimulatorStatus) -> Unit): Boolean {
                    this.listener = listener
                    return true
                }

                override fun enable(initialLocation: GeoPoint, altitudeMeters: Double, callback: dji.v5.common.callback.CommonCallbacks.CompletionCallback) {
                    publishedStatus = SimulatorStatus(enabled = true, location = initialLocation, altitudeMeters = altitudeMeters, satelliteCount = 12)
                    listener?.invoke(publishedStatus)
                    callback.onSuccess()
                }

                override fun disable(callback: dji.v5.common.callback.CommonCallbacks.CompletionCallback) {
                    publishedStatus = SimulatorStatus()
                    listener?.invoke(publishedStatus)
                    callback.onSuccess()
                }
            }
        )

        var lastStatus = adapter.status()
        adapter.addStateListener("test") { lastStatus = it }

        assertTrue(adapter.enable(GeoPoint(25.0, 121.0), 15.0))
        assertTrue(lastStatus.enabled)
        assertEquals(15.0, lastStatus.altitudeMeters, 0.0)

        assertTrue(adapter.disable())
        assertFalse(lastStatus.enabled)
    }

    @Test
    fun simulatorAdapter_retriesListenerRegistrationAfterEarlyFailure() = runTest {
        var addListenerAttempts = 0
        val adapter = DjiSimulatorAdapter(
            gateway = object : DjiSimulatorAdapter.Gateway {
                override fun isEnabled(): Boolean = false

                override fun addListener(listener: (SimulatorStatus) -> Unit): Boolean {
                    addListenerAttempts += 1
                    return addListenerAttempts > 1
                }

                override fun enable(initialLocation: GeoPoint, altitudeMeters: Double, callback: dji.v5.common.callback.CommonCallbacks.CompletionCallback) {
                    callback.onSuccess()
                }

                override fun disable(callback: dji.v5.common.callback.CommonCallbacks.CompletionCallback) {
                    callback.onSuccess()
                }
            }
        )

        assertEquals(SimulatorStatus(), adapter.status())
        adapter.addStateListener("retry") { }

        assertEquals(2, addListenerAttempts)
    }

    @Test
    fun simulatorAdapter_usesToStringWhenDjiErrorDescriptionIsNull() = runTest {
        val adapter = DjiSimulatorAdapter(
            gateway = object : DjiSimulatorAdapter.Gateway {
                override fun isEnabled(): Boolean = false

                override fun addListener(listener: (SimulatorStatus) -> Unit): Boolean = true

                override fun enable(initialLocation: GeoPoint, altitudeMeters: Double, callback: dji.v5.common.callback.CommonCallbacks.CompletionCallback) {
                    callback.onFailure(
                        object : IDJIError {
                            override fun errorType(): ErrorType = ErrorType.COMMON
                            override fun errorCode(): String = "ERR_ENABLE"
                            override fun innerCode(): String = ""
                            override fun hint(): String = ""
                            override fun description(): String? = null
                            override fun isError(code: String?): Boolean = code == errorCode()
                            override fun toString(): String = "ERR_ENABLE(null description)"
                        }
                    )
                }

                override fun disable(callback: dji.v5.common.callback.CommonCallbacks.CompletionCallback) {
                    callback.onSuccess()
                }
            }
        )

        assertFalse(adapter.enable(GeoPoint(25.0, 121.0), 15.0))
        assertEquals("ERR_ENABLE(null description)", adapter.lastCommandError())
    }

    @Test
    fun simulatorAdapter_normalizesUnsupportedStartSimulatorError() = runTest {
        val adapter = DjiSimulatorAdapter(
            gateway = object : DjiSimulatorAdapter.Gateway {
                override fun isEnabled(): Boolean = false

                override fun addListener(listener: (SimulatorStatus) -> Unit): Boolean = true

                override fun enable(initialLocation: GeoPoint, altitudeMeters: Double, callback: dji.v5.common.callback.CommonCallbacks.CompletionCallback) {
                    callback.onFailure(
                        object : IDJIError {
                            override fun errorType(): ErrorType = ErrorType.CORE
                            override fun errorCode(): String = "REQUEST_HANDLER_NOT_FOUND"
                            override fun innerCode(): String = "FLIGHTCONTROLLER.StartSimulator:-1"
                            override fun hint(): String = "error code = -1"
                            override fun description(): String? = null
                            override fun isError(code: String?): Boolean = code == errorCode()
                            override fun toString(): String =
                                "ErrorImp(errorType='CORE', errorCode='REQUEST_HANDLER_NOT_FOUND', innerCode='FLIGHTCONTROLLER.StartSimulator:-1', description='null', hint='error code = -1')"
                        }
                    )
                }

                override fun disable(callback: dji.v5.common.callback.CommonCallbacks.CompletionCallback) {
                    callback.onSuccess()
                }
            }
        )

        assertFalse(adapter.enable(GeoPoint(25.0, 121.0), 15.0))
        assertEquals(
            "DJI MSDK simulator is unavailable on this aircraft / firmware combination (REQUEST_HANDLER_NOT_FOUND for FLIGHTCONTROLLER.StartSimulator).",
            adapter.lastCommandError()
        )
    }

    @Test
    fun simulatorAdapter_timesOutWhenDjiNeverCallsBack() = runTest {
        val adapter = DjiSimulatorAdapter(
            gateway = object : DjiSimulatorAdapter.Gateway {
                override fun isEnabled(): Boolean = false

                override fun addListener(listener: (SimulatorStatus) -> Unit): Boolean = true

                override fun enable(initialLocation: GeoPoint, altitudeMeters: Double, callback: dji.v5.common.callback.CommonCallbacks.CompletionCallback) {
                    Unit
                }

                override fun disable(callback: dji.v5.common.callback.CommonCallbacks.CompletionCallback) {
                    Unit
                }
            },
            commandTimeoutMillis = 5L
        )

        assertFalse(adapter.enable(GeoPoint(25.0, 121.0), 15.0))
        assertEquals(
            "DJI simulator command timed out after 5ms without a callback.",
            adapter.lastCommandError()
        )
    }

    @Test
    fun simulatorAdapter_statusReflectsGatewayEnabledBeforeListenerSamples() = runTest {
        val adapter = DjiSimulatorAdapter(
            gateway = object : DjiSimulatorAdapter.Gateway {
                override fun isEnabled(): Boolean = true

                override fun addListener(listener: (SimulatorStatus) -> Unit): Boolean = true

                override fun enable(initialLocation: GeoPoint, altitudeMeters: Double, callback: dji.v5.common.callback.CommonCallbacks.CompletionCallback) {
                    callback.onSuccess()
                }

                override fun disable(callback: dji.v5.common.callback.CommonCallbacks.CompletionCallback) {
                    callback.onSuccess()
                }
            }
        )

        assertTrue(adapter.status().enabled)
    }

    @Test
    fun simulatorScenarioHarness_replaysTransitBranchHoldRth() = runTest {
        val adapter = object : SimulatorAdapter {
            private val listeners = linkedMapOf<String, (SimulatorStatus) -> Unit>()
            private var status = SimulatorStatus()

            override fun status(): SimulatorStatus = status

            override fun addStateListener(listenerId: String, listener: (SimulatorStatus) -> Unit) {
                listeners[listenerId] = listener
                listener(status)
            }

            override fun removeStateListener(listenerId: String) {
                listeners.remove(listenerId)
            }

            override suspend fun enable(initialLocation: GeoPoint, altitudeMeters: Double): Boolean {
                status = SimulatorStatus(enabled = true, location = initialLocation, altitudeMeters = altitudeMeters, satelliteCount = 12)
                listeners.values.forEach { it(status) }
                return true
            }

            override suspend fun disable(): Boolean {
                status = SimulatorStatus()
                listeners.values.forEach { it(status) }
                return true
            }
        }
        val reducer = FlightReducer(
            transitionGuard = DefaultTransitionGuard(),
            safetySupervisor = DefaultSafetySupervisor(
                holdPolicy = DefaultHoldPolicy(),
                rthPolicy = DefaultRthPolicy()
            )
        )
        val harness = SimulatorScenarioHarness(adapter, reducer)

        val replay = harness.replay(
            initialLocation = GeoPoint(25.0, 121.0),
            altitudeMeters = 15.0,
            initialState = FlightState(stage = FlightStage.TRANSIT, missionUploaded = true),
            scenario = SimulatorScenario.TRANSIT_BRANCH_HOLD_RTH
        )

        assertTrue(replay.simulatorSamples.any { it.enabled })
        assertTrue(replay.enableSucceeded)
        assertTrue(replay.listenerObserved)
        assertTrue(replay.enabledSampleObserved)
        assertNull(replay.failureReason)
        assertEquals(
            listOf(
                FlightStage.TRANSIT,
                FlightStage.BRANCH_VERIFY,
                FlightStage.HOLD,
                FlightStage.RTH
            ),
            replay.visitedStages
        )
        assertEquals(FlightStage.RTH, replay.finalState.stage)
    }

    @Test
    fun simulatorScenarioHarness_marksReplayInvalidWhenEnableFails() = runTest {
        val adapter = object : SimulatorAdapter {
            override fun status(): SimulatorStatus = SimulatorStatus()

            override fun addStateListener(listenerId: String, listener: (SimulatorStatus) -> Unit) = Unit

            override fun removeStateListener(listenerId: String) = Unit

            override suspend fun enable(initialLocation: GeoPoint, altitudeMeters: Double): Boolean = false

            override suspend fun disable(): Boolean = true

            override fun lastCommandError(): String? = "simulator enable failed"
        }
        val reducer = FlightReducer(
            transitionGuard = DefaultTransitionGuard(),
            safetySupervisor = DefaultSafetySupervisor(
                holdPolicy = DefaultHoldPolicy(),
                rthPolicy = DefaultRthPolicy()
            )
        )
        val harness = SimulatorScenarioHarness(
            simulatorAdapter = adapter,
            reducer = reducer,
            enableObservationTimeoutMillis = 5L,
            observationPollIntervalMillis = 1L
        )

        val replay = harness.replay(
            initialLocation = GeoPoint(25.0, 121.0),
            altitudeMeters = 15.0,
            initialState = FlightState(stage = FlightStage.TRANSIT, missionUploaded = true),
            scenario = SimulatorScenario.TRANSIT_BRANCH_HOLD_RTH
        )

        assertFalse(replay.enableSucceeded)
        assertFalse(replay.listenerObserved)
        assertFalse(replay.enabledSampleObserved)
        assertEquals("simulator enable failed", replay.failureReason)
    }

    @Test
    fun simulatorScenarioHarness_marksReplayInvalidWhenListenerNeverPublishesState() = runTest {
        val adapter = object : SimulatorAdapter {
            override fun status(): SimulatorStatus = SimulatorStatus()

            override fun addStateListener(listenerId: String, listener: (SimulatorStatus) -> Unit) = Unit

            override fun removeStateListener(listenerId: String) = Unit

            override suspend fun enable(initialLocation: GeoPoint, altitudeMeters: Double): Boolean = true

            override suspend fun disable(): Boolean = true
        }
        val reducer = FlightReducer(
            transitionGuard = DefaultTransitionGuard(),
            safetySupervisor = DefaultSafetySupervisor(
                holdPolicy = DefaultHoldPolicy(),
                rthPolicy = DefaultRthPolicy()
            )
        )
        val harness = SimulatorScenarioHarness(
            simulatorAdapter = adapter,
            reducer = reducer,
            enableObservationTimeoutMillis = 5L,
            observationPollIntervalMillis = 1L
        )

        val replay = harness.replay(
            initialLocation = GeoPoint(25.0, 121.0),
            altitudeMeters = 15.0,
            initialState = FlightState(stage = FlightStage.TRANSIT, missionUploaded = true),
            scenario = SimulatorScenario.TRANSIT_BRANCH_HOLD_RTH
        )

        assertTrue(replay.enableSucceeded)
        assertFalse(replay.listenerObserved)
        assertFalse(replay.enabledSampleObserved)
        assertEquals(
            "Replay completed reducer transitions, but no MSDK simulator state update was observed.",
            replay.failureReason
        )
    }
}
