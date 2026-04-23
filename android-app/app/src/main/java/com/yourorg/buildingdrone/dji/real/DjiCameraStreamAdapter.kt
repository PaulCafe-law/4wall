package com.yourorg.buildingdrone.dji.real

import android.graphics.SurfaceTexture
import android.view.Surface
import android.view.TextureView
import com.yourorg.buildingdrone.dji.CameraFrameSample
import com.yourorg.buildingdrone.dji.CameraStreamAdapter
import com.yourorg.buildingdrone.dji.CameraStreamStatus
import dji.sdk.keyvalue.value.common.ComponentIndexType
import dji.v5.manager.datacenter.MediaDataCenter
import dji.v5.manager.interfaces.ICameraStreamManager
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull

private const val DEFAULT_CAMERA_ID = "LEFT_OR_MAIN"
private val PREFERRED_CAMERA_ORDER = listOf(
    "LEFT_OR_MAIN",
    "RIGHT",
    "UP",
    "PORT_1",
    "PORT_2",
    "PORT_3",
    "PORT_4",
    "FPV",
    "VISION_ASSIST"
)

class DjiCameraStreamAdapter(
    private val gateway: Gateway = RealGateway(),
    private val startupTimeoutMillis: Long = 5_000L,
    private val currentTimeMillis: () -> Long = System::currentTimeMillis
) : CameraStreamAdapter {
    interface Gateway {
        fun addAvailableCameraListener(listener: AvailableCameraListener)
        fun removeAvailableCameraListener(listener: AvailableCameraListener)
        fun enableStream(cameraId: String, enabled: Boolean)
        fun addFrameListener(cameraId: String, listener: FrameListener)
        fun removeFrameListener(listener: FrameListener)
        fun bindSurface(cameraId: String, surface: Surface, width: Int, height: Int)
        fun unbindSurface(surface: Surface)
    }

    fun interface FrameListener {
        fun onFrame(frame: CameraFrameSample)
    }

    fun interface AvailableCameraListener {
        fun onAvailableCamerasUpdated(availableCameraIds: List<String>)
    }

    private data class BoundFrameListener(
        val cameraId: String,
        val listener: FrameListener
    )

    private val listenerMap = linkedMapOf<String, BoundFrameListener>()
    private var bootstrapListener: BoundFrameListener? = null
    private var availableCameraListenerRegistered = false
    private var availableCameraIds: List<String> = emptyList()
    private var activeCameraId: String? = null
    private var status = CameraStreamStatus()
    private val boundPreviewSurfaces = linkedMapOf<TextureView, Surface>()

    private val availableCameraListener = AvailableCameraListener { cameraIds ->
        availableCameraIds = cameraIds
        val selectedCamera = selectPreferredCameraId(cameraIds) ?: activeCameraId
        status = status.copy(
            selectedCameraIndex = selectedCamera,
            sourceAvailable = selectedCamera != null && (cameraIds.isEmpty() || cameraIds.contains(selectedCamera))
        )
    }

    override fun status(): CameraStreamStatus = status

    override fun addFrameListener(listenerId: String, listener: (CameraFrameSample) -> Unit) {
        if (listenerMap.containsKey(listenerId)) {
            return
        }
        ensureAvailableCameraListenerRegistered()
        val cameraId = resolveCameraId()
        if (cameraId == null) {
            status = status.copy(
                available = false,
                streaming = false,
                sourceAvailable = false,
                selectedCameraIndex = null
            )
            return
        }
        val frameListener = FrameListener { frame ->
            updateFrameStatus(cameraId, frame.timestampMillis)
            listener(frame)
        }
        listenerMap[listenerId] = BoundFrameListener(cameraId, frameListener)
        gateway.addFrameListener(cameraId, frameListener)
    }

    override fun removeFrameListener(listenerId: String) {
        listenerMap.remove(listenerId)?.let { bound ->
            gateway.removeFrameListener(bound.listener)
        }
    }

    override suspend fun start(): Boolean {
        ensureAvailableCameraListenerRegistered()
        teardownBootstrapListener()

        val cameraId = resolveCameraId()
        if (cameraId == null) {
            status = CameraStreamStatus(
                available = false,
                streaming = false,
                selectedCameraIndex = null,
                sourceAvailable = false
            )
            return false
        }

        activeCameraId = cameraId
        val firstFrame = CompletableDeferred<Unit>()
        val frameListener = FrameListener { frame ->
            updateFrameStatus(cameraId, frame.timestampMillis)
            if (!firstFrame.isCompleted) {
                firstFrame.complete(Unit)
            }
        }
        bootstrapListener = BoundFrameListener(cameraId, frameListener)
        status = CameraStreamStatus(
            available = false,
            streaming = false,
            selectedCameraIndex = cameraId,
            sourceAvailable = isCameraSourceAvailable(cameraId)
        )

        return try {
            gateway.addFrameListener(cameraId, frameListener)
            gateway.enableStream(cameraId, true)
            status = status.copy(streaming = true)

            val frameArrived = withTimeoutOrNull(startupTimeoutMillis) {
                firstFrame.await()
            } != null

            if (frameArrived) {
                status = status.copy(
                    available = true,
                    streaming = true,
                    sourceAvailable = true,
                    startupTimedOut = false,
                    lastError = null
                )
                true
            } else {
                status = status.copy(
                    available = false,
                    streaming = true,
                    sourceAvailable = isCameraSourceAvailable(cameraId),
                    startupTimedOut = true,
                    lastError = null
                )
                false
            }
        } catch (error: Exception) {
            status = status.copy(
                available = false,
                streaming = false,
                startupTimedOut = false,
                lastError = error.message ?: error.javaClass.simpleName
            )
            false
        }
    }

    override suspend fun stop(): Boolean {
        val cameraId = activeCameraId ?: resolveCameraId()
        return runCatching {
            teardownBootstrapListener()
            releasePreviewSurfaces()
            if (cameraId != null) {
                gateway.enableStream(cameraId, false)
            }
            status = status.copy(streaming = false)
            true
        }.getOrElse {
            false
        }
    }

    override fun bindPreview(textureView: TextureView): Boolean {
        ensureAvailableCameraListenerRegistered()
        val cameraId = resolveCameraId() ?: return false
        val surfaceTexture = textureView.surfaceTexture ?: return false
        val width = textureView.width.takeIf { it > 0 } ?: 1280
        val height = textureView.height.takeIf { it > 0 } ?: 720
        val existing = boundPreviewSurfaces.remove(textureView)
        existing?.let(gateway::unbindSurface)
        val surface = Surface(surfaceTexture)
        gateway.bindSurface(cameraId, surface, width, height)
        boundPreviewSurfaces[textureView] = surface
        activeCameraId = cameraId
        status = status.copy(
            available = true,
            streaming = true,
            selectedCameraIndex = cameraId,
            sourceAvailable = true,
            startupTimedOut = false,
            lastError = null,
        )
        return true
    }

    override fun unbindPreview(textureView: TextureView) {
        boundPreviewSurfaces.remove(textureView)?.let { surface ->
            gateway.unbindSurface(surface)
            surface.release()
        }
    }

    private fun ensureAvailableCameraListenerRegistered() {
        if (availableCameraListenerRegistered) {
            return
        }
        gateway.addAvailableCameraListener(availableCameraListener)
        availableCameraListenerRegistered = true
    }

    private fun teardownBootstrapListener() {
        bootstrapListener?.let { bound ->
            gateway.removeFrameListener(bound.listener)
        }
        bootstrapListener = null
    }

    private fun releasePreviewSurfaces() {
        boundPreviewSurfaces.values.forEach { surface ->
            gateway.unbindSurface(surface)
            surface.release()
        }
        boundPreviewSurfaces.clear()
    }

    private fun resolveCameraId(): String? {
        val selected = selectPreferredCameraId(availableCameraIds) ?: DEFAULT_CAMERA_ID
        status = status.copy(
            selectedCameraIndex = selected,
            sourceAvailable = isCameraSourceAvailable(selected)
        )
        return selected
    }

    private fun isCameraSourceAvailable(cameraId: String): Boolean {
        return availableCameraIds.isEmpty() || availableCameraIds.contains(cameraId)
    }

    private fun updateFrameStatus(cameraId: String, timestampMillis: Long) {
        status = status.copy(
            available = true,
            streaming = true,
            selectedCameraIndex = cameraId,
            sourceAvailable = true,
            startupTimedOut = false,
            lastError = null,
            lastFrameTimestampMillis = timestampMillis
        )
    }

    private fun selectPreferredCameraId(cameraIds: List<String>): String? {
        if (cameraIds.isEmpty()) {
            return null
        }
        return PREFERRED_CAMERA_ORDER.firstOrNull(cameraIds::contains) ?: cameraIds.firstOrNull()
    }

    private class RealGateway : Gateway {
        private val frameListeners = mutableMapOf<FrameListener, ICameraStreamManager.CameraFrameListener>()
        private val availableCameraListeners = mutableMapOf<AvailableCameraListener, ICameraStreamManager.AvailableCameraUpdatedListener>()

        override fun addAvailableCameraListener(listener: AvailableCameraListener) {
            val sdkListener = object : ICameraStreamManager.AvailableCameraUpdatedListener {
                override fun onAvailableCameraUpdated(availableCameraList: MutableList<ComponentIndexType>) {
                    listener.onAvailableCamerasUpdated(availableCameraList.map(ComponentIndexType::name))
                }

                override fun onCameraStreamEnableUpdate(cameraStreamEnableMap: MutableMap<ComponentIndexType, Boolean>) = Unit
            }
            availableCameraListeners[listener] = sdkListener
            MediaDataCenter.getInstance().cameraStreamManager.addAvailableCameraUpdatedListener(sdkListener)
        }

        override fun removeAvailableCameraListener(listener: AvailableCameraListener) {
            availableCameraListeners.remove(listener)?.let {
                MediaDataCenter.getInstance().cameraStreamManager.removeAvailableCameraUpdatedListener(it)
            }
        }

        override fun enableStream(cameraId: String, enabled: Boolean) {
            MediaDataCenter.getInstance().cameraStreamManager.enableStream(cameraId.toComponentIndexType(), enabled)
        }

        override fun addFrameListener(cameraId: String, listener: FrameListener) {
            val sdkListener = object : ICameraStreamManager.CameraFrameListener {
                override fun onFrame(
                    frameData: ByteArray,
                    offset: Int,
                    length: Int,
                    width: Int,
                    height: Int,
                    format: ICameraStreamManager.FrameFormat
                ) {
                    listener.onFrame(
                        CameraFrameSample(
                            width = width,
                            height = height,
                            format = format.name,
                            timestampMillis = System.currentTimeMillis()
                        )
                    )
                }
            }
            frameListeners[listener] = sdkListener
            MediaDataCenter.getInstance().cameraStreamManager.addFrameListener(
                cameraId.toComponentIndexType(),
                ICameraStreamManager.FrameFormat.YUV420_888,
                sdkListener
            )
        }

        override fun removeFrameListener(listener: FrameListener) {
            frameListeners.remove(listener)?.let {
                MediaDataCenter.getInstance().cameraStreamManager.removeFrameListener(it)
            }
        }

        override fun bindSurface(cameraId: String, surface: Surface, width: Int, height: Int) {
            MediaDataCenter.getInstance().cameraStreamManager.putCameraStreamSurface(
                cameraId.toComponentIndexType(),
                surface,
                width,
                height,
                ICameraStreamManager.ScaleType.CENTER_CROP,
            )
        }

        override fun unbindSurface(surface: Surface) {
            MediaDataCenter.getInstance().cameraStreamManager.removeCameraStreamSurface(surface)
        }

        private fun String.toComponentIndexType(): ComponentIndexType {
            return when (this) {
                "LEFT_OR_MAIN" -> ComponentIndexType.LEFT_OR_MAIN
                "RIGHT" -> ComponentIndexType.RIGHT
                "UP" -> ComponentIndexType.UP
                "PORT_1" -> ComponentIndexType.PORT_1
                "PORT_2" -> ComponentIndexType.PORT_2
                "PORT_3" -> ComponentIndexType.PORT_3
                "PORT_4" -> ComponentIndexType.PORT_4
                "FPV" -> ComponentIndexType.FPV
                "VISION_ASSIST" -> ComponentIndexType.VISION_ASSIST
                else -> throw IllegalArgumentException("Unsupported camera source: $this")
            }
        }
    }
}
