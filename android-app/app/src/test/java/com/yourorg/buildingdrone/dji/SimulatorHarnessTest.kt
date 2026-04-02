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
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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

                override fun addListener(listener: (SimulatorStatus) -> Unit) {
                    this.listener = listener
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
}
