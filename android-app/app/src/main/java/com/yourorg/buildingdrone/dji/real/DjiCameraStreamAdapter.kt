package com.yourorg.buildingdrone.dji.real

import com.yourorg.buildingdrone.dji.CameraFrameSample
import com.yourorg.buildingdrone.dji.CameraStreamAdapter
import com.yourorg.buildingdrone.dji.CameraStreamStatus
import dji.sdk.keyvalue.value.common.ComponentIndexType
import dji.v5.manager.datacenter.MediaDataCenter
import dji.v5.manager.interfaces.ICameraStreamManager

class DjiCameraStreamAdapter(
    private val gateway: Gateway = RealGateway()
) : CameraStreamAdapter {
    interface Gateway {
        fun enableStream(enabled: Boolean)
        fun addFrameListener(listener: FrameListener)
        fun removeFrameListener(listener: FrameListener)
    }

    fun interface FrameListener {
        fun onFrame(frame: CameraFrameSample)
    }

    private val listenerMap = linkedMapOf<String, FrameListener>()
    private var status = CameraStreamStatus(available = false, streaming = false)

    override fun status(): CameraStreamStatus = status

    override fun addFrameListener(listenerId: String, listener: (CameraFrameSample) -> Unit) {
        if (listenerMap.containsKey(listenerId)) {
            return
        }
        val frameListener = FrameListener { frame ->
            status = status.copy(available = true, lastFrameTimestampMillis = frame.timestampMillis)
            listener(frame)
        }
        listenerMap[listenerId] = frameListener
        gateway.addFrameListener(frameListener)
    }

    override fun removeFrameListener(listenerId: String) {
        listenerMap.remove(listenerId)?.let(gateway::removeFrameListener)
    }

    override suspend fun start(): Boolean {
        gateway.enableStream(true)
        status = status.copy(available = true, streaming = true)
        return true
    }

    override suspend fun stop(): Boolean {
        gateway.enableStream(false)
        status = status.copy(streaming = false)
        return true
    }

    private class RealGateway : Gateway {
        private val cameraIndex = ComponentIndexType.FPV
        private val frameListeners = mutableMapOf<FrameListener, ICameraStreamManager.CameraFrameListener>()

        override fun enableStream(enabled: Boolean) {
            MediaDataCenter.getInstance().cameraStreamManager.enableStream(cameraIndex, enabled)
        }

        override fun addFrameListener(listener: FrameListener) {
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
                cameraIndex,
                ICameraStreamManager.FrameFormat.YUV420_888,
                sdkListener
            )
        }

        override fun removeFrameListener(listener: FrameListener) {
            frameListeners.remove(listener)?.let {
                MediaDataCenter.getInstance().cameraStreamManager.removeFrameListener(it)
            }
        }
    }
}
