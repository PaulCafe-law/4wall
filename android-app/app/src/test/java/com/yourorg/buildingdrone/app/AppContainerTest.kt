package com.yourorg.buildingdrone.app

import com.yourorg.buildingdrone.data.FakeMissionRepository
import com.yourorg.buildingdrone.data.InMemoryFlightLogRepository
import com.yourorg.buildingdrone.data.StaticDeviceStorageRepository
import com.yourorg.buildingdrone.data.demoMissionBundle
import com.yourorg.buildingdrone.dji.CameraFrameSample
import com.yourorg.buildingdrone.dji.CameraStreamAdapter
import com.yourorg.buildingdrone.dji.CameraStreamStatus
import com.yourorg.buildingdrone.dji.DeviceHealthState
import com.yourorg.buildingdrone.dji.FakeMobileSdkSession
import com.yourorg.buildingdrone.dji.FakePerceptionAdapter
import com.yourorg.buildingdrone.dji.FakeSimulatorAdapter
import com.yourorg.buildingdrone.dji.FakeVirtualStickAdapter
import com.yourorg.buildingdrone.dji.FakeWaypointMissionAdapter
import com.yourorg.buildingdrone.dji.FlyZoneState
import com.yourorg.buildingdrone.dji.HardwareSnapshot
import com.yourorg.buildingdrone.dji.HardwareStatusProvider
import com.yourorg.buildingdrone.dji.SdkSessionState
import com.yourorg.buildingdrone.dji.SimulatorStatus
import com.yourorg.buildingdrone.dji.UserAccountState
import com.yourorg.buildingdrone.domain.operations.IndoorNoGpsConfirmationState
import com.yourorg.buildingdrone.domain.operations.OperationProfile
import com.yourorg.buildingdrone.domain.safety.PreflightGateId
import com.yourorg.buildingdrone.ui.ScreenDataState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppContainerTest {
    private fun createContainer(
        hardwareSnapshot: HardwareSnapshot,
        cameraStatus: CameraStreamStatus = CameraStreamStatus(),
        runtimeMode: RuntimeMode = RuntimeMode.PROD
    ): AppContainer {
        val bundle = demoMissionBundle()
        return AppContainer(
            runtimeMode = runtimeMode,
            missionRepository = FakeMissionRepository(bundle),
            flightLogRepository = InMemoryFlightLogRepository(),
            storageRepository = StaticDeviceStorageRepository(2L * 1024L * 1024L * 1024L),
            mobileSdkSession = FakeMobileSdkSession(),
            hardwareStatusProvider = StaticHardwareStatusProvider(hardwareSnapshot),
            waypointMissionAdapter = FakeWaypointMissionAdapter(),
            virtualStickAdapter = FakeVirtualStickAdapter(),
            cameraStreamAdapter = StaticCameraStreamAdapter(cameraStatus),
            perceptionAdapter = FakePerceptionAdapter(),
            simulatorAdapter = FakeSimulatorAdapter()
        )
    }

    @Test
    fun evaluatePreflight_usesSpecificCameraTimeoutDetail() {
        val container = createContainer(
            hardwareSnapshot = HardwareSnapshot(
                sdkRegistered = true,
                aircraftConnected = true,
                remoteControllerConnected = true,
                gpsSatelliteCount = 12,
                gpsSignalLevel = "LEVEL_5",
                userAccount = UserAccountState(loggedIn = true, accountId = "pilot")
            ),
            cameraStatus = CameraStreamStatus(
                available = false,
                streaming = true,
                selectedCameraIndex = "LEFT_OR_MAIN",
                sourceAvailable = true,
                startupTimedOut = true
            )
        )

        val evaluation = container.evaluatePreflight(demoMissionBundle())
        val cameraGate = evaluation.blockers.first { it.gateId == PreflightGateId.CAMERA_STREAM }

        assertFalse(evaluation.canTakeoff)
        assertEquals("Camera stream startup timed out", cameraGate.detail)
    }

    @Test
    fun evaluateConnectionGuide_reportsAircraftLinkGap() {
        val container = createContainer(
            hardwareSnapshot = HardwareSnapshot(
                sdkRegistered = true,
                aircraftConnected = false,
                remoteControllerConnected = true,
                productType = "Mini 4 Pro",
                firmwareVersion = "01.00.1100",
                userAccount = UserAccountState(loggedIn = true, accountId = "pilot")
            )
        )

        val state = container.evaluateConnectionGuide(
            missionBundle = demoMissionBundle(),
            sdkState = SdkSessionState(initialized = true, registered = true),
            usbAccessoryAttached = true
        )

        assertEquals(ScreenDataState.ERROR, state.status)
        assertFalse(state.canContinueToPreflight)
        assertTrue(state.blockers.any { it.contains("aircraft", ignoreCase = true) })
    }

    @Test
    fun evaluateConnectionGuide_allowsIndoorGpsPendingWhenProfileIndoor() {
        val container = createContainer(
            hardwareSnapshot = HardwareSnapshot(
                sdkRegistered = true,
                aircraftConnected = true,
                remoteControllerConnected = true,
                productType = "Mini 4 Pro",
                firmwareVersion = "01.00.1100",
                gpsSatelliteCount = 0,
                gpsSignalLevel = "LEVEL_0",
                deviceHealth = DeviceHealthState(blocking = false, summary = null),
                userAccount = UserAccountState(loggedIn = true, accountId = "pilot")
            ),
            cameraStatus = CameraStreamStatus(
                available = true,
                streaming = true,
                selectedCameraIndex = "LEFT_OR_MAIN",
                sourceAvailable = true,
                lastFrameTimestampMillis = 111L
            )
        )

        val state = container.evaluateConnectionGuide(
            missionBundle = demoMissionBundle(),
            sdkState = SdkSessionState(initialized = true, registered = true),
            usbAccessoryAttached = true,
            operationProfile = OperationProfile.INDOOR_NO_GPS
        )

        assertEquals(ScreenDataState.SUCCESS, state.status)
        assertTrue(state.canContinueToPreflight)
        assertEquals("GPS / positioning", state.checklist.last().label)
        assertTrue(state.checklist.last().passed)
        assertFalse(state.blockers.any { it.contains("GPS", ignoreCase = true) })
    }

    @Test
    fun evaluateConnectionGuide_allowsPreflightWhenDjiAccountLoggedOutButFirmwareReadable() {
        val container = createContainer(
            hardwareSnapshot = HardwareSnapshot(
                sdkRegistered = true,
                aircraftConnected = true,
                remoteControllerConnected = true,
                productType = "Mini 4 Pro",
                firmwareVersion = "01.00.1100",
                gpsSatelliteCount = 12,
                gpsSignalLevel = "LEVEL_5",
                userAccount = UserAccountState(loggedIn = false, accountId = null)
            ),
            cameraStatus = CameraStreamStatus(
                available = true,
                streaming = true,
                selectedCameraIndex = "LEFT_OR_MAIN",
                sourceAvailable = true,
                lastFrameTimestampMillis = 123L
            )
        )

        val state = container.evaluateConnectionGuide(
            missionBundle = demoMissionBundle(),
            sdkState = SdkSessionState(initialized = true, registered = true),
            usbAccessoryAttached = true
        )

        assertTrue(state.canContinueToPreflight)
        assertTrue(state.warning?.contains("DJI account", ignoreCase = true) == true)
        assertFalse(state.blockers.any { it.contains("DJI account", ignoreCase = true) })
        assertTrue(state.checklist[3].passed)
    }

    @Test
    fun evaluateConnectionGuide_allowsPreflightWhenSdkReportsRcWithoutUsbAttach() {
        val container = createContainer(
            hardwareSnapshot = HardwareSnapshot(
                sdkRegistered = true,
                aircraftConnected = true,
                remoteControllerConnected = true,
                productType = "Mini 4 Pro",
                firmwareVersion = "01.00.1100",
                gpsSatelliteCount = 12,
                gpsSignalLevel = "LEVEL_5"
            ),
            cameraStatus = CameraStreamStatus(
                available = true,
                streaming = true,
                selectedCameraIndex = "LEFT_OR_MAIN",
                sourceAvailable = true,
                lastFrameTimestampMillis = 444L
            )
        )

        val state = container.evaluateConnectionGuide(
            missionBundle = demoMissionBundle(),
            sdkState = SdkSessionState(initialized = true, registered = true),
            usbAccessoryAttached = false
        )

        assertTrue(state.canContinueToPreflight)
        assertTrue(state.checklist.first().passed)
        assertTrue(state.warning?.contains("USB attach", ignoreCase = true) == true)
        assertFalse(state.blockers.any { it.contains("RC-N2/N3", ignoreCase = true) })
    }

    @Test
    fun evaluateConnectionGuide_blocksWhenUsbAttachSeenButSdkHasNotReportedRc() {
        val container = createContainer(
            hardwareSnapshot = HardwareSnapshot(
                sdkRegistered = true,
                aircraftConnected = false,
                remoteControllerConnected = false,
                productType = "Mini 4 Pro",
                firmwareVersion = null,
                gpsSatelliteCount = 0,
                gpsSignalLevel = "LEVEL_0"
            )
        )

        val state = container.evaluateConnectionGuide(
            missionBundle = demoMissionBundle(),
            sdkState = SdkSessionState(initialized = true, registered = true),
            usbAccessoryAttached = true
        )

        assertFalse(state.canContinueToPreflight)
        assertFalse(state.checklist.first().passed)
        assertTrue(state.blockers.any { it.contains("remote controller connected", ignoreCase = true) })
        assertTrue(state.checklist.first().detail.contains("USB accessory", ignoreCase = true))
    }

    @Test
    fun evaluateConnectionGuide_blocksWhenFirmwareVersionMissing() {
        val container = createContainer(
            hardwareSnapshot = HardwareSnapshot(
                sdkRegistered = true,
                aircraftConnected = true,
                remoteControllerConnected = true,
                productType = "Mini 4 Pro",
                firmwareVersion = null,
                gpsSatelliteCount = 12,
                gpsSignalLevel = "LEVEL_5",
                userAccount = UserAccountState(loggedIn = false, accountId = null)
            ),
            cameraStatus = CameraStreamStatus(
                available = true,
                streaming = true,
                selectedCameraIndex = "LEFT_OR_MAIN",
                sourceAvailable = true,
                lastFrameTimestampMillis = 321L
            )
        )

        val state = container.evaluateConnectionGuide(
            missionBundle = demoMissionBundle(),
            sdkState = SdkSessionState(initialized = true, registered = true),
            usbAccessoryAttached = true
        )

        assertFalse(state.canContinueToPreflight)
        assertTrue(state.blockers.any { it.contains("firmware", ignoreCase = true) })
        assertFalse(state.checklist[3].passed)
    }

    @Test
    fun evaluatePreflight_allowsIndoorNoGpsWhenConfirmationsComplete() {
        val container = createContainer(
            hardwareSnapshot = HardwareSnapshot(
                sdkRegistered = true,
                aircraftConnected = true,
                remoteControllerConnected = true,
                productType = "Mini 4 Pro",
                firmwareVersion = "01.00.1100",
                gpsSatelliteCount = 0,
                gpsSignalLevel = "LEVEL_0",
                deviceHealth = DeviceHealthState(blocking = false),
                flyZone = FlyZoneState(blocking = false)
            ),
            cameraStatus = CameraStreamStatus(
                available = true,
                streaming = true,
                selectedCameraIndex = "LEFT_OR_MAIN",
                sourceAvailable = true,
                lastFrameTimestampMillis = 555L
            )
        )

        val evaluation = container.evaluatePreflight(
            missionBundle = demoMissionBundle(),
            operationProfile = OperationProfile.INDOOR_NO_GPS,
            indoorConfirmationState = IndoorNoGpsConfirmationState(
                siteConfirmed = true,
                rthUnavailableAcknowledged = true,
                observerReady = true,
                takeoffZoneClear = true,
                manualTakeoverReady = true
            )
        )

        assertTrue(evaluation.canTakeoff)
        assertFalse(evaluation.blockers.any { it.gateId == PreflightGateId.GPS })
    }

    @Test
    fun evaluatePreflight_blocksIndoorNoGpsWhenConfirmationsMissing() {
        val container = createContainer(
            hardwareSnapshot = HardwareSnapshot(
                sdkRegistered = true,
                aircraftConnected = true,
                remoteControllerConnected = true,
                productType = "Mini 4 Pro",
                firmwareVersion = "01.00.1100",
                gpsSatelliteCount = 0,
                gpsSignalLevel = "LEVEL_0",
                deviceHealth = DeviceHealthState(blocking = false),
                flyZone = FlyZoneState(blocking = false)
            ),
            cameraStatus = CameraStreamStatus(
                available = true,
                streaming = true,
                selectedCameraIndex = "LEFT_OR_MAIN",
                sourceAvailable = true,
                lastFrameTimestampMillis = 555L
            )
        )

        val evaluation = container.evaluatePreflight(
            missionBundle = demoMissionBundle(),
            operationProfile = OperationProfile.INDOOR_NO_GPS,
            indoorConfirmationState = IndoorNoGpsConfirmationState()
        )

        assertFalse(evaluation.canTakeoff)
        assertTrue(evaluation.blockers.any { it.gateId == PreflightGateId.INDOOR_PROFILE_CONFIRMATION })
    }

    @Test
    fun evaluateSimulatorVerification_reportsUnsupportedMsdkSimulator() {
        val container = createContainer(hardwareSnapshot = HardwareSnapshot())
        val error =
            "DJI MSDK simulator is unavailable on this aircraft / firmware combination (REQUEST_HANDLER_NOT_FOUND for FLIGHTCONTROLLER.StartSimulator)."

        val state = container.evaluateSimulatorVerification(
            missionBundle = demoMissionBundle(),
            simulatorStatus = SimulatorStatus(),
            simulatorObservedThisSession = false,
            branchReplay = null,
            inspectionReplay = null,
            simulatorCommandError = error,
            blackboxArmed = true,
            incidentExportObserved = false
        )

        assertTrue(state.canContinueToConnectionGuide)
        assertTrue(state.benchOnlyFallbackActive)
        assertFalse(state.simulatorActionsEnabled)
        assertTrue(state.propOnBlockedReason?.isNotBlank() == true)
        assertEquals(error, state.checklist[1].detail)
    }

    @Test
    fun evaluateSimulatorVerification_allowsExplicitBenchOnlyFallback() {
        val container = createContainer(hardwareSnapshot = HardwareSnapshot())

        val state = container.evaluateSimulatorVerification(
            missionBundle = demoMissionBundle(),
            simulatorStatus = SimulatorStatus(),
            simulatorObservedThisSession = false,
            branchReplay = null,
            inspectionReplay = null,
            benchOnlyFallbackRequested = true,
            simulatorCommandError = null,
            blackboxArmed = true,
            incidentExportObserved = false
        )

        assertTrue(state.benchOnlyFallbackActive)
        assertTrue(state.canContinueToConnectionGuide)
        assertEquals("Continue to Connection Guide (Bench Only)", state.continueLabel)
        assertFalse(state.canActivateBenchOnlyFallback)
        assertFalse(state.simulatorActionsEnabled)
    }

    private class StaticHardwareStatusProvider(
        private val snapshot: HardwareSnapshot
    ) : HardwareStatusProvider {
        override fun currentSnapshot(): HardwareSnapshot = snapshot
    }

    private class StaticCameraStreamAdapter(
        private val status: CameraStreamStatus
    ) : CameraStreamAdapter {
        override fun status(): CameraStreamStatus = status
        override fun addFrameListener(listenerId: String, listener: (CameraFrameSample) -> Unit) = Unit
        override fun removeFrameListener(listenerId: String) = Unit
        override suspend fun start(): Boolean = status.available
        override suspend fun stop(): Boolean = true
    }
}
