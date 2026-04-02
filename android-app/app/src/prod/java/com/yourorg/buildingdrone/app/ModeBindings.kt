package com.yourorg.buildingdrone.app

import android.app.Application
import com.yourorg.buildingdrone.data.FakeMissionRepository
import com.yourorg.buildingdrone.data.FileDeviceStorageRepository
import com.yourorg.buildingdrone.data.InMemoryFlightLogRepository
import com.yourorg.buildingdrone.data.seedMissionBundle
import com.yourorg.buildingdrone.dji.real.DjiCameraStreamAdapter
import com.yourorg.buildingdrone.dji.real.DjiConnectionRepository
import com.yourorg.buildingdrone.dji.real.DjiPerceptionAdapter
import com.yourorg.buildingdrone.dji.real.DjiSdkSession
import com.yourorg.buildingdrone.dji.real.DjiSimulatorAdapter
import com.yourorg.buildingdrone.dji.real.DjiVirtualStickAdapter
import com.yourorg.buildingdrone.dji.real.DjiWaypointMissionAdapter
import java.io.File

fun installModeRuntime(application: Application) {
    com.cySdkyc.clx.Helper.install(application)
}

fun createAppContainer(application: Application): AppContainer {
    val seededBundle = seedMissionBundle(File(application.filesDir, "seeded-prod-mission"))

    return AppContainer(
        runtimeMode = RuntimeMode.PROD,
        missionRepository = FakeMissionRepository(seededBundle),
        flightLogRepository = InMemoryFlightLogRepository(),
        storageRepository = FileDeviceStorageRepository(application.filesDir),
        mobileSdkSession = DjiSdkSession(),
        hardwareStatusProvider = DjiConnectionRepository(),
        waypointMissionAdapter = DjiWaypointMissionAdapter(),
        virtualStickAdapter = DjiVirtualStickAdapter(),
        cameraStreamAdapter = DjiCameraStreamAdapter(),
        perceptionAdapter = DjiPerceptionAdapter(),
        simulatorAdapter = DjiSimulatorAdapter()
    )
}
