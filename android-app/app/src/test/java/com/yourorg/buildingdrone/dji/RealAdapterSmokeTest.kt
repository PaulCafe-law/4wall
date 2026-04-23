package com.yourorg.buildingdrone.dji

import com.yourorg.buildingdrone.data.seedMissionBundle
import com.yourorg.buildingdrone.dji.real.DjiConnectionRepository
import com.yourorg.buildingdrone.dji.real.DjiCameraStreamAdapter
import com.yourorg.buildingdrone.dji.real.DjiPerceptionAdapter
import com.yourorg.buildingdrone.dji.real.DjiSdkSession
import com.yourorg.buildingdrone.dji.real.DjiVirtualStickAdapter
import com.yourorg.buildingdrone.dji.real.DjiWaypointMissionAdapter
import com.yourorg.buildingdrone.dji.real.mapDjiDeviceHealth
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.io.path.createTempDirectory

class RealAdapterSmokeTest {
    @Test
    fun djiSdkSession_tracksInitializationAndRegistration() {
        val session = DjiSdkSession(
            gateway = object : DjiSdkSession.Gateway {
                private var registered = false
                private var listener: ((Boolean) -> Unit)? = null

                override fun init(application: android.app.Application, callback: DjiSdkSession.Callback) {
                    callback.onInitProcess(true, 100)
                    registered = true
                    callback.onRegisterSuccess()
                    listener?.invoke(true)
                }

                override fun destroy() = Unit
                override fun registerApp() { registered = true }
                override fun isRegistered(): Boolean = registered
                override fun addNetworkStatusListener(listener: (Boolean) -> Unit) { this.listener = listener }
                override fun removeNetworkStatusListener() { listener = null }
            },
            manifestApiKeyProvider = { "real-key" }
        )

        session.initialize(android.app.Application())

        assertTrue(session.state.value.initialized)
        assertTrue(session.state.value.registered)
    }

    @Test
    fun djiConnectionRepository_mapsGatewaySnapshot() {
        val repository = DjiConnectionRepository(
            gateway = object : DjiConnectionRepository.Gateway {
                override fun registered() = true
                override fun aircraftConnected() = true
                override fun remoteControllerConnected() = true
                override fun productType() = "Mini 4 Pro"
                override fun firmwareVersion() = "01.00"
                override fun isFlying() = true
                override fun ultrasonicHeightDm() = 8
                override fun gpsSatelliteCount() = 14
                override fun gpsSignalLevel() = "LEVEL_5"
                override fun userAccountState() = UserAccountState(loggedIn = true, accountId = "pilot")
                override fun deviceHealthState() = DeviceHealthState(blocking = false, summary = "OK")
                override fun flyZoneState() = FlyZoneState(blocking = false, summary = "OK")
            }
        )

        val snapshot = repository.currentSnapshot()

        assertEquals("Mini 4 Pro", snapshot.productType)
        assertTrue(snapshot.isFlying)
        assertEquals(8, snapshot.ultrasonicHeightDm)
        assertTrue(snapshot.gpsReady)
        assertTrue(snapshot.userAccount.loggedIn)
    }

    @Test
    fun djiWaypointMissionAdapter_loadsUploadsAndStartsMission() = runTest {
        val seedRoot = createTempDirectory(prefix = "real-adapter-kmz").toFile()
        val bundle = seedMissionBundle(seedRoot)
        var uploadedPath: String? = null
        var startedMissionId: String? = null

        val adapter = DjiWaypointMissionAdapter(
            gateway = object : DjiWaypointMissionAdapter.Gateway {
                override fun uploadKmz(path: String, callback: dji.v5.common.callback.CommonCallbacks.CompletionCallbackWithProgress<Double>) {
                    uploadedPath = path
                    callback.onSuccess()
                }

                override fun startMission(missionId: String, waylineIds: List<Int>, callback: dji.v5.common.callback.CommonCallbacks.CompletionCallback) {
                    startedMissionId = missionId
                    callback.onSuccess()
                }

                override fun pauseMission(callback: dji.v5.common.callback.CommonCallbacks.CompletionCallback) = callback.onSuccess()
                override fun resumeMission(callback: dji.v5.common.callback.CommonCallbacks.CompletionCallback) = callback.onSuccess()
                override fun stopMission(missionId: String, callback: dji.v5.common.callback.CommonCallbacks.CompletionCallback) = callback.onSuccess()
                override fun availableWaylineIds(kmzPath: String): List<Int> = listOf(0)
            }
        )

        val loadStatus = adapter.loadKmzMission(MissionLoadRequest(bundle.artifacts.missionKmz.localPath, bundle.missionId))

        assertTrue(loadStatus.valid)
        assertTrue(adapter.uploadMission(bundle))
        assertTrue(adapter.startMission())
        assertEquals(bundle.artifacts.missionKmz.localPath, uploadedPath)
        assertEquals(bundle.missionId, startedMissionId)
        assertEquals(MissionExecutionState.RUNNING, adapter.executionState())

        seedRoot.deleteRecursively()
    }

    @Test
    fun djiVirtualStickAdapter_rejectsSendOutsideEnabledWindow() = runTest {
        var enableCount = 0
        var sendCount = 0
        val adapter = DjiVirtualStickAdapter(
            gateway = object : DjiVirtualStickAdapter.Gateway {
                override fun enable(callback: dji.v5.common.callback.CommonCallbacks.CompletionCallback) {
                    enableCount += 1
                    callback.onSuccess()
                }

                override fun disable(callback: dji.v5.common.callback.CommonCallbacks.CompletionCallback) = callback.onSuccess()
                override fun setAdvancedModeEnabled(enabled: Boolean) = Unit
                override fun send(command: VirtualStickCommand) {
                    sendCount += 1
                }
            }
        )

        assertFalse(adapter.send(VirtualStickCommand(throttle = 0.2f)))
        assertTrue(adapter.enable(VirtualStickWindow.LOCAL_AVOID))
        assertTrue(adapter.send(VirtualStickCommand(throttle = 0.2f)))
        assertEquals(1, enableCount)
        assertEquals(1, sendCount)
    }

    @Test
    fun djiCameraStreamAdapter_prefersMainCameraAndMarksStreamAvailableAfterFrame() = runTest {
        var lastEnabled: Boolean? = null
        var selectedCamera: String? = null
        var availableCameraListener: DjiCameraStreamAdapter.AvailableCameraListener? = null
        lateinit var frameListener: DjiCameraStreamAdapter.FrameListener
        val adapter = DjiCameraStreamAdapter(
            gateway = object : DjiCameraStreamAdapter.Gateway {
                override fun addAvailableCameraListener(listener: DjiCameraStreamAdapter.AvailableCameraListener) {
                    availableCameraListener = listener
                    listener.onAvailableCamerasUpdated(
                        listOf("FPV", "LEFT_OR_MAIN")
                    )
                }

                override fun removeAvailableCameraListener(listener: DjiCameraStreamAdapter.AvailableCameraListener) = Unit

                override fun enableStream(cameraId: String, enabled: Boolean) {
                    lastEnabled = enabled
                    selectedCamera = cameraId
                    frameListener.onFrame(
                        CameraFrameSample(
                            width = 1280,
                            height = 720,
                            format = "YUV420_888",
                            timestampMillis = 1234L
                        )
                    )
                }

                override fun addFrameListener(cameraId: String, listener: DjiCameraStreamAdapter.FrameListener) {
                    selectedCamera = cameraId
                    frameListener = listener
                }

                override fun removeFrameListener(listener: DjiCameraStreamAdapter.FrameListener) = Unit
            }
        )

        assertTrue(adapter.start())
        assertEquals(true, lastEnabled)
        assertEquals("LEFT_OR_MAIN", selectedCamera)
        assertTrue(availableCameraListener != null)
        assertTrue(adapter.status().available)
        assertTrue(adapter.status().streaming)
        assertEquals("LEFT_OR_MAIN", adapter.status().selectedCameraIndex)
        assertTrue(adapter.status().sourceAvailable)
    }

    @Test
    fun djiCameraStreamAdapter_timesOutWhenNoFrameArrives() = runTest {
        val adapter = DjiCameraStreamAdapter(
            gateway = object : DjiCameraStreamAdapter.Gateway {
                override fun addAvailableCameraListener(listener: DjiCameraStreamAdapter.AvailableCameraListener) {
                    listener.onAvailableCamerasUpdated(listOf("LEFT_OR_MAIN"))
                }

                override fun removeAvailableCameraListener(listener: DjiCameraStreamAdapter.AvailableCameraListener) = Unit

                override fun enableStream(cameraId: String, enabled: Boolean) = Unit

                override fun addFrameListener(cameraId: String, listener: DjiCameraStreamAdapter.FrameListener) = Unit

                override fun removeFrameListener(listener: DjiCameraStreamAdapter.FrameListener) = Unit
            },
            startupTimeoutMillis = 1L
        )

        assertFalse(adapter.start())
        assertEquals("LEFT_OR_MAIN", adapter.status().selectedCameraIndex)
        assertTrue(adapter.status().sourceAvailable)
        assertTrue(adapter.status().startupTimedOut)
        assertFalse(adapter.status().available)
    }

    @Test
    fun djiCameraStreamAdapter_reportsFailureWhenGatewayThrows() = runTest {
        val adapter = DjiCameraStreamAdapter(
            gateway = object : DjiCameraStreamAdapter.Gateway {
                override fun addAvailableCameraListener(listener: DjiCameraStreamAdapter.AvailableCameraListener) {
                    listener.onAvailableCamerasUpdated(listOf("LEFT_OR_MAIN"))
                }

                override fun removeAvailableCameraListener(listener: DjiCameraStreamAdapter.AvailableCameraListener) = Unit

                override fun enableStream(cameraId: String, enabled: Boolean) {
                    throw IllegalStateException("stream unavailable")
                }

                override fun addFrameListener(cameraId: String, listener: DjiCameraStreamAdapter.FrameListener) = Unit

                override fun removeFrameListener(listener: DjiCameraStreamAdapter.FrameListener) = Unit
            }
        )

        assertFalse(adapter.start())
        assertFalse(adapter.status().available)
        assertFalse(adapter.status().streaming)
        assertEquals("stream unavailable", adapter.status().lastError)
    }

    @Test
    fun djiCameraStreamAdapter_fallsBackWhenMainCameraAbsent() = runTest {
        var selectedCamera: String? = null
        lateinit var frameListener: DjiCameraStreamAdapter.FrameListener
        val adapter = DjiCameraStreamAdapter(
            gateway = object : DjiCameraStreamAdapter.Gateway {
                override fun addAvailableCameraListener(listener: DjiCameraStreamAdapter.AvailableCameraListener) {
                    listener.onAvailableCamerasUpdated(listOf("RIGHT", "FPV"))
                }

                override fun removeAvailableCameraListener(listener: DjiCameraStreamAdapter.AvailableCameraListener) = Unit

                override fun enableStream(cameraId: String, enabled: Boolean) {
                    selectedCamera = cameraId
                    frameListener.onFrame(
                        CameraFrameSample(
                            width = 960,
                            height = 540,
                            format = "YUV420_888",
                            timestampMillis = 5678L
                        )
                    )
                }

                override fun addFrameListener(cameraId: String, listener: DjiCameraStreamAdapter.FrameListener) {
                    selectedCamera = cameraId
                    frameListener = listener
                }

                override fun removeFrameListener(listener: DjiCameraStreamAdapter.FrameListener) = Unit
            }
        )

        assertTrue(adapter.start())
        assertEquals("RIGHT", selectedCamera)
        assertEquals("RIGHT", adapter.status().selectedCameraIndex)
    }

    @Test
    fun mapDjiDeviceHealth_routesGpsOnlyStatusAwayFromDeviceHealth() {
        val state = mapDjiDeviceHealth("NON_GPS_NONVISION", "NON_GPS_NONVISION")

        assertFalse(state.blocking)
        assertEquals(null, state.summary)
    }

    @Test
    fun djiPerceptionAdapter_retriesStartAfterEarlyFailure() {
        var startAttempts = 0
        val adapter = DjiPerceptionAdapter(
            gateway = object : DjiPerceptionAdapter.Gateway {
                override fun start(
                    onPerceptionInfo: (dji.v5.manager.aircraft.perception.data.PerceptionInfo) -> Unit,
                    onObstacleData: (dji.v5.manager.aircraft.perception.data.ObstacleData) -> Unit
                ): Boolean {
                    startAttempts += 1
                    return startAttempts > 1
                }
            }
        )

        assertEquals(PerceptionSnapshot(), adapter.currentSnapshot())
        adapter.addObstacleListener("retry") { }

        assertEquals(2, startAttempts)
    }
}
