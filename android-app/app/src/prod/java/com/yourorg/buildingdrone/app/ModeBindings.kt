package com.yourorg.buildingdrone.app

import android.app.Application
import com.yourorg.buildingdrone.BuildConfig
import com.yourorg.buildingdrone.data.FileDeviceStorageRepository
import com.yourorg.buildingdrone.data.InMemoryFlightLogRepository
import com.yourorg.buildingdrone.data.auth.OperatorAuthRepository
import com.yourorg.buildingdrone.data.network.PlannerApi
import com.yourorg.buildingdrone.data.network.PlannerTransport
import com.yourorg.buildingdrone.data.sync.ServerMissionRepository
import com.yourorg.buildingdrone.data.upload.FileFlightUploadRepository
import com.yourorg.buildingdrone.dji.real.DjiCameraStreamAdapter
import com.yourorg.buildingdrone.dji.real.DjiConnectionRepository
import com.yourorg.buildingdrone.dji.real.DjiPerceptionAdapter
import com.yourorg.buildingdrone.dji.real.DjiSdkSession
import com.yourorg.buildingdrone.dji.real.DjiSimulatorAdapter
import com.yourorg.buildingdrone.dji.real.DjiVirtualStickAdapter
import com.yourorg.buildingdrone.dji.real.DjiWaypointMissionAdapter
import java.io.File
import okhttp3.OkHttpClient

fun installModeRuntime(application: Application) {
    com.cySdkyc.clx.Helper.install(application)
}

fun createAppContainer(application: Application): AppContainer {
    val httpClient = OkHttpClient()
    val rawTransport = PlannerTransport(
        baseUrl = BuildConfig.PLANNER_BASE_URL,
        client = httpClient
    )
    val authRepository = OperatorAuthRepository(
        context = application,
        transport = rawTransport
    )
    val authenticatedTransport = PlannerTransport(
        baseUrl = BuildConfig.PLANNER_BASE_URL,
        client = httpClient,
        tokenProvider = authRepository
    )
    val plannerApi = PlannerApi(authenticatedTransport)
    val missionRepository = ServerMissionRepository(
        plannerApi = plannerApi,
        rootDirectory = File(application.filesDir, "planner-cache"),
        planRequestFactory = ::defaultProdMissionPlanRequest
    )
    val flightUploadRepository = FileFlightUploadRepository(
        plannerApi = plannerApi,
        rootDirectory = File(application.filesDir, "upload-backlog")
    )

    return AppContainer(
        runtimeMode = RuntimeMode.PROD,
        missionRepository = missionRepository,
        flightLogRepository = InMemoryFlightLogRepository(),
        storageRepository = FileDeviceStorageRepository(application.filesDir),
        mobileSdkSession = DjiSdkSession(),
        hardwareStatusProvider = DjiConnectionRepository(),
        waypointMissionAdapter = DjiWaypointMissionAdapter(),
        virtualStickAdapter = DjiVirtualStickAdapter(),
        cameraStreamAdapter = DjiCameraStreamAdapter(),
        perceptionAdapter = DjiPerceptionAdapter(),
        simulatorAdapter = DjiSimulatorAdapter(),
        operatorAuthRepository = authRepository,
        flightUploadRepository = flightUploadRepository
    )
}
