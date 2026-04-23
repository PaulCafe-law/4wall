package com.yourorg.buildingdrone.dji.real

import android.util.Log
import com.yourorg.buildingdrone.dji.FlightControlAdapter
import dji.sdk.keyvalue.key.FlightControllerKey
import dji.sdk.keyvalue.key.KeyTools
import dji.sdk.keyvalue.value.common.EmptyMsg
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.v5.manager.KeyManager
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

class DjiFlightControlAdapter(
    private val gateway: Gateway = RealGateway(),
    private val commandTimeoutMillis: Long = 5_000L
) : FlightControlAdapter {
    interface Gateway {
        fun takeoff(callback: CommonCallbacks.CompletionCallbackWithParam<EmptyMsg>)
        fun startAutoLanding(callback: CommonCallbacks.CompletionCallbackWithParam<EmptyMsg>)
        fun stopAutoLanding(callback: CommonCallbacks.CompletionCallbackWithParam<EmptyMsg>)
        fun confirmLanding(callback: CommonCallbacks.CompletionCallbackWithParam<EmptyMsg>)
        fun isLandingConfirmationNeeded(): Boolean
    }

    private var lastCommandError: String? = null

    override suspend fun takeoff(): Boolean {
        lastCommandError = null
        logInfo("takeoff() requested")
        val result = suspendCompletion { gateway.takeoff(it) }
        if (!result.success) {
            lastCommandError = result.errorMessage ?: "DJI takeoff failed."
            logWarn("takeoff() failed: $lastCommandError")
        }
        return result.success
    }

    override suspend fun startAutoLanding(): Boolean {
        lastCommandError = null
        logInfo("startAutoLanding() requested")
        val result = suspendCompletion { gateway.startAutoLanding(it) }
        if (!result.success) {
            lastCommandError = result.errorMessage ?: "DJI auto landing failed."
            logWarn("startAutoLanding() failed: $lastCommandError")
        }
        return result.success
    }

    override suspend fun stopAutoLanding(): Boolean {
        lastCommandError = null
        logInfo("stopAutoLanding() requested")
        val result = suspendCompletion { gateway.stopAutoLanding(it) }
        if (!result.success) {
            lastCommandError = result.errorMessage ?: "DJI stop landing failed."
            logWarn("stopAutoLanding() failed: $lastCommandError")
        }
        return result.success
    }

    override suspend fun confirmLanding(): Boolean {
        lastCommandError = null
        logInfo("confirmLanding() requested")
        val result = suspendCompletion { gateway.confirmLanding(it) }
        if (!result.success) {
            lastCommandError = result.errorMessage ?: "DJI confirm landing failed."
            logWarn("confirmLanding() failed: $lastCommandError")
        }
        return result.success
    }

    override fun isLandingConfirmationNeeded(): Boolean =
        runCatching { gateway.isLandingConfirmationNeeded() }.getOrDefault(false)

    override fun lastCommandError(): String? = lastCommandError

    private suspend fun suspendCompletion(
        block: (CommonCallbacks.CompletionCallbackWithParam<EmptyMsg>) -> Unit
    ): CompletionResult {
        val result = withTimeoutOrNull(commandTimeoutMillis) {
            suspendCancellableCoroutine { continuation ->
                val callback = object : CommonCallbacks.CompletionCallbackWithParam<EmptyMsg> {
                    override fun onSuccess(param: EmptyMsg) {
                        if (continuation.isActive) {
                            continuation.resume(CompletionResult(success = true))
                        }
                    }

                    override fun onFailure(error: IDJIError) {
                        val message = normalizeErrorMessage(error)
                        logError("DJI flight control callback failure: $message")
                        if (continuation.isActive) {
                            continuation.resume(CompletionResult(success = false, errorMessage = message))
                        }
                    }
                }
                try {
                    block(callback)
                } catch (error: Throwable) {
                    val message = error.message ?: error::class.java.simpleName ?: "DJI flight control command threw."
                    logError("DJI flight control command threw before callback", error)
                    if (continuation.isActive) {
                        continuation.resume(CompletionResult(success = false, errorMessage = message))
                    }
                }
            }
        }

        return result ?: CompletionResult(
            success = false,
            errorMessage = "DJI flight control command timed out after ${commandTimeoutMillis}ms."
        ).also {
            logError(it.errorMessage!!)
        }
    }

    private fun normalizeErrorMessage(error: IDJIError): String {
        val description = runCatching { error.description() as String? }.getOrNull()
        if (!description.isNullOrBlank()) {
            return description
        }
        val fallback = runCatching { error.toString() }.getOrNull()
        return if (fallback.isNullOrBlank()) {
            "DJI flight control command failed."
        } else {
            fallback
        }
    }

    private data class CompletionResult(
        val success: Boolean,
        val errorMessage: String? = null
    )

    companion object {
        private const val TAG = "DjiFlightControl"
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

    private class RealGateway : Gateway {
        override fun takeoff(callback: CommonCallbacks.CompletionCallbackWithParam<EmptyMsg>) {
            KeyManager.getInstance().performAction(
                KeyTools.createKey(FlightControllerKey.KeyStartTakeoff),
                callback
            )
        }

        override fun startAutoLanding(callback: CommonCallbacks.CompletionCallbackWithParam<EmptyMsg>) {
            KeyManager.getInstance().performAction(
                KeyTools.createKey(FlightControllerKey.KeyStartAutoLanding),
                callback
            )
        }

        override fun stopAutoLanding(callback: CommonCallbacks.CompletionCallbackWithParam<EmptyMsg>) {
            KeyManager.getInstance().performAction(
                KeyTools.createKey(FlightControllerKey.KeyStopAutoLanding),
                callback
            )
        }

        override fun confirmLanding(callback: CommonCallbacks.CompletionCallbackWithParam<EmptyMsg>) {
            KeyManager.getInstance().performAction(
                KeyTools.createKey(FlightControllerKey.KeyConfirmLanding),
                callback
            )
        }

        override fun isLandingConfirmationNeeded(): Boolean {
            return KeyManager.getInstance().getValue(
                KeyTools.createKey(FlightControllerKey.KeyIsLandingConfirmationNeeded),
                false
            )
        }
    }
}
