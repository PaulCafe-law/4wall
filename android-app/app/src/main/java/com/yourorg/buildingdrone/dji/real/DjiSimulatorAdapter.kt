package com.yourorg.buildingdrone.dji.real

import com.yourorg.buildingdrone.core.GeoPoint
import com.yourorg.buildingdrone.dji.SimulatorAdapter
import com.yourorg.buildingdrone.dji.SimulatorStatus
import dji.sdk.keyvalue.value.common.LocationCoordinate2D
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.v5.manager.aircraft.simulator.InitializationSettings
import dji.v5.manager.aircraft.simulator.SimulatorManager
import dji.v5.manager.aircraft.simulator.SimulatorStatusListener
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

class DjiSimulatorAdapter(
    private val gateway: Gateway = RealGateway()
) : SimulatorAdapter {
    interface Gateway {
        fun isEnabled(): Boolean
        fun addListener(listener: (SimulatorStatus) -> Unit)
        fun enable(initialLocation: GeoPoint, altitudeMeters: Double, callback: CommonCallbacks.CompletionCallback)
        fun disable(callback: CommonCallbacks.CompletionCallback)
    }

    private val listeners = linkedMapOf<String, (SimulatorStatus) -> Unit>()
    private var currentStatus = SimulatorStatus()
    private var started = false

    override fun status(): SimulatorStatus {
        ensureStarted()
        return currentStatus
    }

    override fun addStateListener(listenerId: String, listener: (SimulatorStatus) -> Unit) {
        ensureStarted()
        listeners[listenerId] = listener
        listener(currentStatus)
    }

    override fun removeStateListener(listenerId: String) {
        listeners.remove(listenerId)
    }

    override suspend fun enable(initialLocation: GeoPoint, altitudeMeters: Double): Boolean {
        ensureStarted()
        val enabled = suspendCompletion { gateway.enable(initialLocation, altitudeMeters, it) }
        if (enabled) {
            currentStatus = currentStatus.copy(enabled = true, location = initialLocation, altitudeMeters = altitudeMeters)
            publish()
        }
        return enabled
    }

    override suspend fun disable(): Boolean {
        ensureStarted()
        val disabled = suspendCompletion { gateway.disable(it) }
        if (disabled) {
            currentStatus = SimulatorStatus()
            publish()
        }
        return disabled
    }

    private fun ensureStarted() {
        if (started) {
            return
        }
        started = true
        gateway.addListener { status ->
            currentStatus = status
            publish()
        }
    }

    private fun publish() {
        listeners.values.forEach { it(currentStatus) }
    }

    private suspend fun suspendCompletion(
        block: (CommonCallbacks.CompletionCallback) -> Unit
    ): Boolean = suspendCoroutine { continuation ->
        block(object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
                continuation.resume(true)
            }

            override fun onFailure(error: IDJIError) {
                continuation.resume(false)
            }
        })
    }

    private class RealGateway : Gateway {
        override fun isEnabled(): Boolean = SimulatorManager.getInstance().isSimulatorEnabled

        override fun addListener(listener: (SimulatorStatus) -> Unit) {
            SimulatorManager.getInstance().addSimulatorStateListener(
                SimulatorStatusListener { state ->
                    listener(
                        SimulatorStatus(
                            enabled = SimulatorManager.getInstance().isSimulatorEnabled,
                            location = GeoPoint(state.location.latitude, state.location.longitude),
                            altitudeMeters = state.positionZ.toDouble(),
                            satelliteCount = 12
                        )
                    )
                }
            )
        }

        override fun enable(initialLocation: GeoPoint, altitudeMeters: Double, callback: CommonCallbacks.CompletionCallback) {
            val settings = InitializationSettings.createInstance(
                LocationCoordinate2D(initialLocation.lat, initialLocation.lng),
                10
            )
            SimulatorManager.getInstance().enableSimulator(settings, callback)
        }

        override fun disable(callback: CommonCallbacks.CompletionCallback) {
            SimulatorManager.getInstance().disableSimulator(callback)
        }
    }
}
