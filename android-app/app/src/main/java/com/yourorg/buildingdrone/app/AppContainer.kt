package com.yourorg.buildingdrone.app

import com.yourorg.buildingdrone.data.DeviceStorageRepository
import com.yourorg.buildingdrone.data.FakeMissionRepository
import com.yourorg.buildingdrone.data.FlightLogRepository
import com.yourorg.buildingdrone.data.InMemoryFlightLogRepository
import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.data.MissionRepository
import com.yourorg.buildingdrone.data.StaticDeviceStorageRepository
import com.yourorg.buildingdrone.data.demoMissionBundle
import com.yourorg.buildingdrone.dji.FakeCameraStreamAdapter
import com.yourorg.buildingdrone.dji.FakeHardwareStatusProvider
import com.yourorg.buildingdrone.dji.FakeMobileSdkSession
import com.yourorg.buildingdrone.dji.FakePerceptionAdapter
import com.yourorg.buildingdrone.dji.FakeSimulatorAdapter
import com.yourorg.buildingdrone.dji.FakeVirtualStickAdapter
import com.yourorg.buildingdrone.dji.FakeWaypointMissionAdapter
import com.yourorg.buildingdrone.dji.CameraStreamAdapter
import com.yourorg.buildingdrone.dji.HardwareStatusProvider
import com.yourorg.buildingdrone.dji.MobileSdkSession
import com.yourorg.buildingdrone.dji.PerceptionAdapter
import com.yourorg.buildingdrone.dji.SimulatorAdapter
import com.yourorg.buildingdrone.dji.VirtualStickAdapter
import com.yourorg.buildingdrone.dji.WaypointMissionAdapter
import com.yourorg.buildingdrone.domain.safety.DefaultHoldPolicy
import com.yourorg.buildingdrone.domain.safety.DefaultPreflightGatePolicy
import com.yourorg.buildingdrone.domain.safety.DefaultRthPolicy
import com.yourorg.buildingdrone.domain.safety.DefaultSafetySupervisor
import com.yourorg.buildingdrone.domain.safety.PreflightEvaluation
import com.yourorg.buildingdrone.domain.safety.PreflightGatePolicy
import com.yourorg.buildingdrone.domain.safety.PreflightSnapshot
import com.yourorg.buildingdrone.domain.statemachine.DefaultTransitionGuard
import com.yourorg.buildingdrone.domain.statemachine.FlightReducer

enum class RuntimeMode {
    DEMO,
    PROD
}

class AppContainer(
    val runtimeMode: RuntimeMode,
    val missionRepository: MissionRepository,
    val flightLogRepository: FlightLogRepository,
    val storageRepository: DeviceStorageRepository,
    val mobileSdkSession: MobileSdkSession,
    val hardwareStatusProvider: HardwareStatusProvider,
    val waypointMissionAdapter: WaypointMissionAdapter,
    val virtualStickAdapter: VirtualStickAdapter,
    val cameraStreamAdapter: CameraStreamAdapter,
    val perceptionAdapter: PerceptionAdapter,
    val simulatorAdapter: SimulatorAdapter,
    val minimumStorageBytes: Long = 256L * 1024L * 1024L,
    private val preflightGatePolicy: PreflightGatePolicy = DefaultPreflightGatePolicy()
) {
    constructor(
        missionBundle: MissionBundle = demoMissionBundle()
    ) : this(
        runtimeMode = RuntimeMode.DEMO,
        missionRepository = FakeMissionRepository(missionBundle),
        flightLogRepository = InMemoryFlightLogRepository(),
        storageRepository = StaticDeviceStorageRepository(2L * 1024L * 1024L * 1024L),
        mobileSdkSession = FakeMobileSdkSession(),
        hardwareStatusProvider = FakeHardwareStatusProvider(),
        waypointMissionAdapter = FakeWaypointMissionAdapter(),
        virtualStickAdapter = FakeVirtualStickAdapter(),
        cameraStreamAdapter = FakeCameraStreamAdapter(),
        perceptionAdapter = FakePerceptionAdapter(),
        simulatorAdapter = FakeSimulatorAdapter()
    )

    private val holdPolicy = DefaultHoldPolicy()
    private val rthPolicy = DefaultRthPolicy()

    val safetySupervisor = DefaultSafetySupervisor(
        holdPolicy = holdPolicy,
        rthPolicy = rthPolicy
    )

    val flightReducer = FlightReducer(
        transitionGuard = DefaultTransitionGuard(),
        safetySupervisor = safetySupervisor
    )

    fun evaluatePreflight(missionBundle: MissionBundle?): PreflightEvaluation {
        val hardware = hardwareStatusProvider.currentSnapshot()
        val stream = cameraStreamAdapter.status()

        return preflightGatePolicy.evaluate(
            PreflightSnapshot(
                aircraftConnected = hardware.aircraftConnected,
                remoteControllerConnected = hardware.remoteControllerConnected,
                cameraStreamAvailable = stream.available,
                availableStorageBytes = storageRepository.availableBytes(),
                minimumStorageBytes = minimumStorageBytes,
                deviceHealthBlocking = hardware.deviceHealth.blocking,
                deviceHealthMessage = hardware.deviceHealth.summary,
                flyZoneBlocking = hardware.flyZone.blocking,
                flyZoneMessage = hardware.flyZone.summary,
                gpsReady = hardware.gpsReady,
                gpsDetail = hardware.gpsSignalLevel?.let { "GPS signal $it with ${hardware.gpsSatelliteCount} satellites" },
                missionBundlePresent = missionBundle?.isArtifactComplete() == true,
                missionBundleVerified = missionBundle?.isVerified() == true
            )
        )
    }
}
