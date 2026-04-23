package com.yourorg.buildingdrone.dji.real

import com.yourorg.buildingdrone.dji.CameraControlAdapter
import com.yourorg.buildingdrone.dji.CameraControlStatus
import dji.sdk.keyvalue.key.CameraKey
import dji.sdk.keyvalue.key.DJICameraKey
import dji.sdk.keyvalue.key.DJIGimbalKey
import dji.sdk.keyvalue.key.KeyTools
import dji.sdk.keyvalue.value.camera.CameraMode
import dji.sdk.keyvalue.value.common.Attitude
import dji.sdk.keyvalue.value.common.CameraLensType
import dji.sdk.keyvalue.value.common.ComponentIndexType
import dji.sdk.keyvalue.value.common.EmptyMsg
import dji.sdk.keyvalue.value.gimbal.GimbalAngleRotation
import dji.sdk.keyvalue.value.gimbal.GimbalAngleRotationMode
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.v5.manager.KeyManager
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

class DjiCameraControlAdapter(
    private val gateway: Gateway = RealGateway(),
    private val commandTimeoutMillis: Long = 5_000L,
) : CameraControlAdapter {
    interface Gateway {
        fun isAvailable(): Boolean
        fun isRecording(): Boolean
        fun gimbalPitchDegrees(): Double
        fun setCameraMode(mode: CameraMode, callback: CommonCallbacks.CompletionCallback)
        fun takePhoto(callback: CommonCallbacks.CompletionCallbackWithParam<EmptyMsg>)
        fun startRecording(callback: CommonCallbacks.CompletionCallbackWithParam<EmptyMsg>)
        fun stopRecording(callback: CommonCallbacks.CompletionCallbackWithParam<EmptyMsg>)
        fun rotateGimbalByPitch(deltaDegrees: Double, callback: CommonCallbacks.CompletionCallbackWithParam<EmptyMsg>)
    }

    private var lastKnownRecording = false
    private var lastKnownPitchDegrees = 0.0
    private var lastCommandError: String? = null

    override fun status(): CameraControlStatus {
        val available = runCatching { gateway.isAvailable() }.getOrDefault(false)
        val recording = runCatching { gateway.isRecording() }.getOrDefault(lastKnownRecording)
        val pitch = runCatching { gateway.gimbalPitchDegrees() }.getOrDefault(lastKnownPitchDegrees)
        lastKnownRecording = recording
        lastKnownPitchDegrees = pitch
        return CameraControlStatus(
            available = available,
            recording = recording,
            gimbalPitchDegrees = pitch,
            lastError = lastCommandError,
        )
    }

    override suspend fun takePhoto(): Boolean {
        lastCommandError = null
        val photoModeResult = suspendCompletion { callback ->
            gateway.setCameraMode(CameraMode.PHOTO_NORMAL, callback)
        }
        if (!photoModeResult.success) {
            lastCommandError = photoModeResult.errorMessage ?: "DJI camera photo mode failed."
            return false
        }
        val captureResult = suspendAction { callback -> gateway.takePhoto(callback) }
        if (!captureResult.success) {
            lastCommandError = captureResult.errorMessage ?: "DJI take photo failed."
        }
        return captureResult.success
    }

    override suspend fun startRecording(): Boolean {
        lastCommandError = null
        val videoModeResult = suspendCompletion { callback ->
            gateway.setCameraMode(CameraMode.VIDEO_NORMAL, callback)
        }
        if (!videoModeResult.success) {
            lastCommandError = videoModeResult.errorMessage ?: "DJI camera video mode failed."
            return false
        }
        val recordResult = suspendAction { callback -> gateway.startRecording(callback) }
        if (!recordResult.success) {
            lastCommandError = recordResult.errorMessage ?: "DJI start recording failed."
            return false
        }
        lastKnownRecording = true
        return true
    }

    override suspend fun stopRecording(): Boolean {
        lastCommandError = null
        val recordResult = suspendAction { callback -> gateway.stopRecording(callback) }
        if (!recordResult.success) {
            lastCommandError = recordResult.errorMessage ?: "DJI stop recording failed."
            return false
        }
        lastKnownRecording = false
        return true
    }

    override suspend fun adjustGimbalPitch(deltaDegrees: Double): Boolean {
        lastCommandError = null
        val result = suspendAction { callback -> gateway.rotateGimbalByPitch(deltaDegrees, callback) }
        if (!result.success) {
            lastCommandError = result.errorMessage ?: "DJI gimbal pitch command failed."
            return false
        }
        lastKnownPitchDegrees += deltaDegrees
        return true
    }

    override fun lastCommandError(): String? = lastCommandError

    private suspend fun suspendCompletion(
        block: (CommonCallbacks.CompletionCallback) -> Unit,
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
                        if (continuation.isActive) {
                            continuation.resume(
                                CompletionResult(success = false, errorMessage = normalizeErrorMessage(error)),
                            )
                        }
                    }
                }
                try {
                    block(callback)
                } catch (error: Throwable) {
                    if (continuation.isActive) {
                        continuation.resume(
                            CompletionResult(
                                success = false,
                                errorMessage = error.message ?: error::class.java.simpleName ?: "DJI camera command threw.",
                            ),
                        )
                    }
                }
            }
        }
        return result ?: CompletionResult(
            success = false,
            errorMessage = "DJI camera command timed out after ${commandTimeoutMillis}ms.",
        )
    }

    private suspend fun suspendAction(
        block: (CommonCallbacks.CompletionCallbackWithParam<EmptyMsg>) -> Unit,
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
                        if (continuation.isActive) {
                            continuation.resume(
                                CompletionResult(success = false, errorMessage = normalizeErrorMessage(error)),
                            )
                        }
                    }
                }
                try {
                    block(callback)
                } catch (error: Throwable) {
                    if (continuation.isActive) {
                        continuation.resume(
                            CompletionResult(
                                success = false,
                                errorMessage = error.message ?: error::class.java.simpleName ?: "DJI camera action threw.",
                            ),
                        )
                    }
                }
            }
        }
        return result ?: CompletionResult(
            success = false,
            errorMessage = "DJI camera action timed out after ${commandTimeoutMillis}ms.",
        )
    }

    private fun normalizeErrorMessage(error: IDJIError): String {
        val description = runCatching { error.description() as String? }.getOrNull()
        return description?.takeIf { it.isNotBlank() } ?: error.toString()
    }

    private data class CompletionResult(
        val success: Boolean,
        val errorMessage: String? = null,
    )

    private class RealGateway : Gateway {
        override fun isAvailable(): Boolean {
            return KeyManager.getInstance().getValue(
                KeyTools.createKey(DJICameraKey.KeyConnection, CAMERA_INDEX),
                false,
            )
        }

        override fun isRecording(): Boolean {
            return KeyManager.getInstance().getValue(
                KeyTools.createCameraKey(DJICameraKey.KeyIsRecording, CAMERA_INDEX, CAMERA_LENS),
                false,
            )
        }

        override fun gimbalPitchDegrees(): Double {
            val attitude = KeyManager.getInstance().getValue(
                KeyTools.createKey(DJIGimbalKey.KeyGimbalAttitude, GIMBAL_INDEX),
                Attitude(0.0, 0.0, 0.0),
            )
            return attitude.getPitch() ?: 0.0
        }

        override fun setCameraMode(mode: CameraMode, callback: CommonCallbacks.CompletionCallback) {
            KeyManager.getInstance().setValue(
                KeyTools.createCameraKey(CameraKey.KeyCameraMode, CAMERA_INDEX, CAMERA_LENS),
                mode,
                callback,
            )
        }

        override fun takePhoto(callback: CommonCallbacks.CompletionCallbackWithParam<EmptyMsg>) {
            KeyManager.getInstance().performAction(
                KeyTools.createCameraKey(DJICameraKey.KeyStartShootPhoto, CAMERA_INDEX, CAMERA_LENS),
                callback,
            )
        }

        override fun startRecording(callback: CommonCallbacks.CompletionCallbackWithParam<EmptyMsg>) {
            KeyManager.getInstance().performAction(
                KeyTools.createCameraKey(DJICameraKey.KeyStartRecord, CAMERA_INDEX, CAMERA_LENS),
                callback,
            )
        }

        override fun stopRecording(callback: CommonCallbacks.CompletionCallbackWithParam<EmptyMsg>) {
            KeyManager.getInstance().performAction(
                KeyTools.createCameraKey(DJICameraKey.KeyStopRecord, CAMERA_INDEX, CAMERA_LENS),
                callback,
            )
        }

        override fun rotateGimbalByPitch(
            deltaDegrees: Double,
            callback: CommonCallbacks.CompletionCallbackWithParam<EmptyMsg>,
        ) {
            val rotation = GimbalAngleRotation().apply {
                setMode(GimbalAngleRotationMode.RELATIVE_ANGLE)
                setPitch(deltaDegrees)
                setRoll(0.0)
                setYaw(0.0)
                setPitchIgnored(false)
                setRollIgnored(true)
                setYawIgnored(true)
                setDuration(0.35)
                setJointReferenceUsed(false)
                setTimeout(2)
            }
            KeyManager.getInstance().performAction(
                KeyTools.createKey(DJIGimbalKey.KeyRotateByAngle, GIMBAL_INDEX),
                rotation,
                callback,
            )
        }

        private companion object {
            private val CAMERA_INDEX = ComponentIndexType.LEFT_OR_MAIN
            private val GIMBAL_INDEX = ComponentIndexType.LEFT_OR_MAIN
            private val CAMERA_LENS = CameraLensType.CAMERA_LENS_DEFAULT
        }
    }
}
