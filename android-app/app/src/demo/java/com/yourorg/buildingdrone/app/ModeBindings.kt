package com.yourorg.buildingdrone.app

import android.app.Application
import com.yourorg.buildingdrone.data.FileFlightLogRepository
import com.yourorg.buildingdrone.data.FakeMissionRepository
import com.yourorg.buildingdrone.data.StaticDeviceStorageRepository
import com.yourorg.buildingdrone.data.demoMissionBundle
import com.yourorg.buildingdrone.dji.FakeCameraStreamAdapter
import com.yourorg.buildingdrone.dji.FakeHardwareStatusProvider
import com.yourorg.buildingdrone.dji.FakeMobileSdkSession
import com.yourorg.buildingdrone.dji.FakePerceptionAdapter
import com.yourorg.buildingdrone.dji.FakeSimulatorAdapter
import com.yourorg.buildingdrone.dji.FakeVirtualStickAdapter
import com.yourorg.buildingdrone.dji.FakeWaypointMissionAdapter

fun installModeRuntime(application: Application) = Unit

fun createAppContainer(application: Application): AppContainer {
    return AppContainer(
        runtimeMode = RuntimeMode.DEMO,
        missionRepository = FakeMissionRepository(demoMissionBundle()),
        flightLogRepository = FileFlightLogRepository(application.filesDir.resolve("demo-blackbox")),
        storageRepository = StaticDeviceStorageRepository(2L * 1024L * 1024L * 1024L),
        mobileSdkSession = FakeMobileSdkSession(),
        hardwareStatusProvider = FakeHardwareStatusProvider(),
        waypointMissionAdapter = FakeWaypointMissionAdapter(),
        virtualStickAdapter = FakeVirtualStickAdapter(),
        cameraStreamAdapter = FakeCameraStreamAdapter(),
        perceptionAdapter = FakePerceptionAdapter(),
        simulatorAdapter = FakeSimulatorAdapter()
    )
}
