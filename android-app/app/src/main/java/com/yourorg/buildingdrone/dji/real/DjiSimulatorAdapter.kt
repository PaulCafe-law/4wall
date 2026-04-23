package com.yourorg.buildingdrone.dji.real

import android.util.Log
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
import kotlin.math.roundToInt
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

class DjiSimulatorAdapter(
    private val gateway: Gateway = RealGateway(),
    private val commandTimeoutMillis: Long = 5_000L
) : SimulatorAdapter {
    interface Gateway {
        fun isEnabled(): Boolean
        fun addListener(listener: (SimulatorStatus) -> Unit): Boolean
        fun enable(initialLocation: GeoPoint, altitudeMeters: Double, callback: CommonCallbacks.CompletionCallback)
        fun disable(callback: CommonCallbacks.CompletionCallback)
    }

    private val listeners = linkedMapOf<String, (SimulatorStatus) -> Unit>()
    private var currentStatus = SimulatorStatus()
    private var started = false
    private var lastCommandError: String? = null

    override fun status(): SimulatorStatus {
        ensureStarted()
        refreshStatusFromGateway()
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
        lastCommandError = null
        logInfo("enable() requested at lat=${initialLocation.lat}, lng=${initialLocation.lng}, altitudeMeters=$altitudeMeters")
        val result = suspendCompletion { gateway.enable(initialLocation, altitudeMeters, it) }
        if (!result.success) {
            lastCommandError = result.errorMessage ?: "Failed to enable DJI simulator."
            logWarn("enable() failed: $lastCommandError")
        } else {
            logInfo("enable() completed successfully")
        }
        refreshStatusFromGateway()
        return result.success
    }

    override suspend fun disable(): Boolean {
        ensureStarted()
        lastCommandError = null
        logInfo("disable() requested")
        val result = suspendCompletion { gateway.disable(it) }
        if (!result.success) {
            lastCommandError = result.errorMessage ?: "Failed to disable DJI simulator."
            logWarn("disable() failed: $lastCommandError")
        } else {
            logInfo("disable() completed successfully")
        }
        refreshStatusFromGateway()
        return result.success
    }

    override fun lastCommandError(): String? = lastCommandError

    private fun ensureStarted() {
        if (started) {
            return
        }
        started = gateway.addListener { status ->
            currentStatus = status
            logInfo(
                "listener update enabled=${status.enabled}, lat=${status.location?.lat}, lng=${status.location?.lng}, altitudeMeters=${status.altitudeMeters}, satellites=${status.satelliteCount}"
            )
            publish()
        }
        logInfo("ensureStarted() listener registration started=$started")
        if (!started) {
            refreshStatusFromGateway()
        }
    }

    private fun publish() {
        listeners.values.forEach { it(currentStatus) }
    }

    private fun refreshStatusFromGateway() {
        val enabled = runCatching { gateway.isEnabled() }.getOrDefault(currentStatus.enabled)
        currentStatus = currentStatus.copy(enabled = enabled)
    }

    private suspend fun suspendCompletion(
        block: (CommonCallbacks.CompletionCallback) -> Unit
    ): CompletionResult {
        val result = withTimeoutOrNull(commandTimeoutMillis) {
            suspendCancellableCoroutine { continuation ->
                val callback = object : CommonCallbacks.CompletionCallback {
                    override fun onSuccess() {
                        if (continuation.isActive) {
                            continuation.resume(CompletionResult(success = true))
                        }
                    }

                    override fun onFailure(error: IDJIError) {
                val description: String? = runCatching { error.description() as String? }.getOrNull()
                        val rawMessage = if (description != null && description.any { !it.isWhitespace() }) {
                            description
                        } else {
                            val fallback = runCatching { error.toString() as String? }.getOrNull()
                            if (fallback != null && fallback.any { !it.isWhitespace() }) {
                                fallback
                            } else {
                                "DJI simulator command failed."
                            }
                        }
                        val message = normalizeErrorMessage(rawMessage)
                        logError("DJI simulator callback failure: $message")
                        if (continuation.isActive) {
                            continuation.resume(CompletionResult(success = false, errorMessage = message))
                        }
                    }
                }
                try {
                    block(callback)
                } catch (error: Throwable) {
                    val message = error.message ?: error::class.java.simpleName ?: "DJI simulator command threw."
                    logError("DJI simulator command threw before callback", error)
                    if (continuation.isActive) {
                        continuation.resume(CompletionResult(success = false, errorMessage = message))
                    }
                }
            }
        }
        return result ?: CompletionResult(
            success = false,
            errorMessage = "DJI simulator command timed out after ${commandTimeoutMillis}ms without a callback."
        ).also {
            logError(it.errorMessage!!)
        }
    }

    private data class CompletionResult(
        val success: Boolean,
        val errorMessage: String? = null
    )

    companion object {
        private const val TAG = "DjiSimulatorAdapter"
    }

    private fun logInfo(message: String) {
        runCatching { Log.i(TAG, message) }
    }

    private fun logWarn(message: String) {
        runCatching { Log.w(TAG, message) }
    }

    private fun logError(message: String, error: Throwable? = null) {
        runCatching {
            if (error == null) {
                Log.e(TAG, message)
            } else {
                Log.e(TAG, message, error)
            }
        }
    }

    private fun normalizeErrorMessage(message: String): String {
        val normalized = message.lowercase()
        return if (
            normalized.contains("request_handler_not_found") &&
            normalized.contains("startsimulator")
        ) {
            "DJI MSDK simulator is unavailable on this aircraft / firmware combination (REQUEST_HANDLER_NOT_FOUND for FLIGHTCONTROLLER.StartSimulator)."
        } else {
            message
        }
    }

    private class RealGateway : Gateway {
        override fun isEnabled(): Boolean = SimulatorManager.getInstance().isSimulatorEnabled

        override fun addListener(listener: (SimulatorStatus) -> Unit): Boolean = runCatching {
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
            true
        }.getOrDefault(false)

        override fun enable(initialLocation: GeoPoint, altitudeMeters: Double, callback: CommonCallbacks.CompletionCallback) {
            val settings = InitializationSettings.createInstance(
                LocationCoordinate2D(initialLocation.lat, initialLocation.lng),
                altitudeMeters.roundToInt()
            )
            SimulatorManager.getInstance().enableSimulator(settings, callback)
        }

        override fun disable(callback: CommonCallbacks.CompletionCallback) {
            SimulatorManager.getInstance().disableSimulator(callback)
        }
    }
}
