package com.yourorg.buildingdrone.app

import com.yourorg.buildingdrone.data.DeviceStorageRepository
import com.yourorg.buildingdrone.data.FakeMissionRepository
import com.yourorg.buildingdrone.data.FlightLogRepository
import com.yourorg.buildingdrone.data.InMemoryFlightLogRepository
import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.data.MissionRepository
import com.yourorg.buildingdrone.data.StaticDeviceStorageRepository
import com.yourorg.buildingdrone.data.auth.OperatorAuthRepository
import com.yourorg.buildingdrone.data.demoMissionBundle
import com.yourorg.buildingdrone.data.upload.FlightUploadRepository
import com.yourorg.buildingdrone.dji.CameraStreamAdapter
import com.yourorg.buildingdrone.dji.CameraControlAdapter
import com.yourorg.buildingdrone.dji.CameraStreamStatus
import com.yourorg.buildingdrone.dji.FakeCameraControlAdapter
import com.yourorg.buildingdrone.dji.FakeCameraStreamAdapter
import com.yourorg.buildingdrone.dji.FakeFlightControlAdapter
import com.yourorg.buildingdrone.dji.FakeHardwareStatusProvider
import com.yourorg.buildingdrone.dji.FakeMobileSdkSession
import com.yourorg.buildingdrone.dji.FakePerceptionAdapter
import com.yourorg.buildingdrone.dji.FakeVirtualStickAdapter
import com.yourorg.buildingdrone.dji.FakeWaypointMissionAdapter
import com.yourorg.buildingdrone.dji.FlightControlAdapter
import com.yourorg.buildingdrone.dji.HardwareStatusProvider
import com.yourorg.buildingdrone.dji.MobileSdkSession
import com.yourorg.buildingdrone.dji.PerceptionAdapter
import com.yourorg.buildingdrone.dji.SdkSessionState
import com.yourorg.buildingdrone.dji.VirtualStickAdapter
import com.yourorg.buildingdrone.dji.WaypointMissionAdapter
import com.yourorg.buildingdrone.domain.operations.IndoorNoGpsConfirmationState
import com.yourorg.buildingdrone.domain.operations.MissionContextMode
import com.yourorg.buildingdrone.domain.operations.OperationProfile
import com.yourorg.buildingdrone.domain.operations.OperatorConsoleMode
import com.yourorg.buildingdrone.domain.safety.DefaultHoldPolicy
import com.yourorg.buildingdrone.domain.safety.DefaultLandingPolicy
import com.yourorg.buildingdrone.domain.safety.DefaultPreflightGatePolicy
import com.yourorg.buildingdrone.domain.safety.DefaultRthPolicy
import com.yourorg.buildingdrone.domain.safety.DefaultSafetySupervisor
import com.yourorg.buildingdrone.domain.safety.PreflightEvaluation
import com.yourorg.buildingdrone.domain.safety.PreflightGatePolicy
import com.yourorg.buildingdrone.domain.safety.PreflightSnapshot
import com.yourorg.buildingdrone.domain.statemachine.DefaultTransitionGuard
import com.yourorg.buildingdrone.domain.statemachine.FlightReducer
import com.yourorg.buildingdrone.feature.connection.ConnectionGuideStep
import com.yourorg.buildingdrone.feature.connection.ConnectionGuideUiState
import com.yourorg.buildingdrone.ui.ScreenDataState

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
    val flightControlAdapter: FlightControlAdapter = FakeFlightControlAdapter(),
    val virtualStickAdapter: VirtualStickAdapter,
    val cameraStreamAdapter: CameraStreamAdapter,
    val cameraControlAdapter: CameraControlAdapter,
    val perceptionAdapter: PerceptionAdapter,
    val operatorAuthRepository: OperatorAuthRepository? = null,
    val flightUploadRepository: FlightUploadRepository? = null,
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
        flightControlAdapter = FakeFlightControlAdapter(),
        virtualStickAdapter = FakeVirtualStickAdapter(),
        cameraStreamAdapter = FakeCameraStreamAdapter(),
        cameraControlAdapter = FakeCameraControlAdapter(),
        perceptionAdapter = FakePerceptionAdapter()
    )

    private val holdPolicy = DefaultHoldPolicy()
    private val rthPolicy = DefaultRthPolicy()
    private val landingPolicy = DefaultLandingPolicy()

    val safetySupervisor = DefaultSafetySupervisor(
        holdPolicy = holdPolicy,
        rthPolicy = rthPolicy,
        landingPolicy = landingPolicy
    )

    val flightReducer = FlightReducer(
        transitionGuard = DefaultTransitionGuard(),
        safetySupervisor = safetySupervisor
    )

    fun evaluateConnectionGuide(
        missionBundle: MissionBundle?,
        sdkState: SdkSessionState,
        usbAccessoryAttached: Boolean,
        handoffNotice: String? = null,
        consoleMode: OperatorConsoleMode = OperatorConsoleMode.OUTDOOR_PATROL,
        operationProfile: OperationProfile = consoleMode.executedOperatingProfile,
    ): ConnectionGuideUiState {
        val effectiveConsoleMode = resolveConsoleMode(consoleMode, operationProfile)
        val hardware = hardwareStatusProvider.currentSnapshot()
        val stream = cameraStreamAdapter.status()
        val bundleVerified = missionBundle?.isVerified() == true
        val missionContextMode = effectiveConsoleMode.resolveMissionContextMode(bundleVerified)
        val missionReady = bundleVerified || !effectiveConsoleMode.requiresMissionBundle
        val controllerReady = hardware.remoteControllerConnected
        val aircraftReady = controllerReady && hardware.aircraftConnected
        val cameraReady = aircraftReady && stream.available
        val gpsBlocking = effectiveConsoleMode.requiresGpsGate
        val gpsPassed = !gpsBlocking || hardware.gpsReady
        val djiPrereqReady = when {
            !sdkState.initialized -> false
            !sdkState.registered -> false
            aircraftReady && hardware.firmwareVersion.isNullOrBlank() -> false
            else -> true
        }

        val blockers = buildList {
            if (effectiveConsoleMode.requiresMissionBundle && !missionReady) {
                add("Mission bundle 尚未下載或驗證完成。")
            }
            if (controllerReady && !usbAccessoryAttached) {
                // DJI SDK already reports RC connected; keep missing USB attach as diagnostic only.
            } else if (!usbAccessoryAttached) {
                add("手機尚未接上 RC-N2/N3。")
            } else if (!hardware.remoteControllerConnected) {
                add("DJI SDK 尚未回報 remote controller connected。")
            }
            if (controllerReady && !hardware.aircraftConnected) {
                add("RC 已接上，但 aircraft 尚未 linked。")
            }
            if (!djiPrereqReady) {
                add(djiPrerequisiteDetail(sdkState, hardware.aircraftConnected, hardware.firmwareVersion))
            }
            if (aircraftReady && !cameraReady) {
                add(cameraStatusDetail(stream))
            }
        }

        val warning = listOfNotNull(
            handoffNotice,
            if (!usbAccessoryAttached && controllerReady) {
                "本機尚未觀察到 USB attach intent，但 DJI SDK 已回報 RC connected。"
            } else {
                null
            },
            if (!hardware.userAccount.loggedIn) {
                "DJI account 未登入；目前不阻擋 props-off bench。若這是第一次 activation / firmware bootstrap，請先用 DJI Fly 處理。"
            } else {
                null
            }
        ).distinct().joinToString("\n").ifBlank { null }

        val summary = when {
            controllerReady && !usbAccessoryAttached ->
                "DJI SDK 已回報 RC connected；本機尚未觀察到 USB attach intent。"
            !missionReady -> "先取得並驗證 mission bundle。"
            !usbAccessoryAttached -> "請將手機接上 RC-N2/N3。"
            !hardware.remoteControllerConnected -> "USB accessory 已接上，但 DJI SDK 尚未標記 RC connected。"
            controllerReady && !hardware.aircraftConnected -> "RC 已接上，但 aircraft 尚未 linked。"
            !djiPrereqReady -> "DJI SDK / firmware prerequisite 尚未就緒。"
            aircraftReady && !cameraReady -> "相機串流尚未就緒。"
            operationProfile == OperationProfile.INDOOR_NO_GPS ->
                "直接連線已就緒，可進入 Preflight；GPS 在室內模式只做診斷，不再當作 blocker。"
            gpsBlocking && !hardware.gpsReady ->
                "直接連線已就緒，可進入 Preflight；GPS 仍會在一般 outdoor 模式維持 blocking。"
            else -> "直接連線已就緒，可進入 Preflight。"
        }

        val nextStep = when {
            !missionReady -> "先回 Mission Setup 同步並驗證任務包。"
            !usbAccessoryAttached -> "將手機接到 RC，等待 DJI SDK 建立 accessory 連線。"
            !hardware.remoteControllerConnected -> "保持手機接著 RC，等待 DJI SDK 回報 remote controller connected。"
            controllerReady && !hardware.aircraftConnected ->
                "完成 RC 與 aircraft 連結；若是首次 activation / firmware bootstrap，先去 DJI Fly 完成。"
            !djiPrereqReady -> "先完成 DJI SDK 註冊或 firmware 讀取，再重新檢查連線。"
            operationProfile == OperationProfile.INDOOR_NO_GPS ->
                "進入 Preflight，完成 indoor no-GPS confirmations；RTH 在此模式不可用。"
            else -> "進入 Preflight，確認 GPS gate 與 takeoff blocker。"
        }

        return ConnectionGuideUiState(
            status = when {
                blockers.isNotEmpty() -> ScreenDataState.ERROR
                !gpsPassed -> ScreenDataState.PARTIAL
                else -> ScreenDataState.SUCCESS
            },
            modeLabel = operationProfile.displayLabel,
            summary = summary,
            warning = warning,
            nextStep = nextStep,
            blockers = blockers,
            checklist = listOf(
                ConnectionGuideStep(
                    label = "Controller USB / RC",
                    passed = controllerReady,
                    detail = when {
                        controllerReady && !usbAccessoryAttached ->
                            "DJI SDK 已回報 RC connected；本機尚未觀察到 USB attach intent。"
                        !usbAccessoryAttached -> "尚未接上 RC-N2/N3。"
                        !hardware.remoteControllerConnected -> "USB accessory 已接上，但 DJI SDK 尚未標記 RC connected。"
                        else -> "Remote controller connected"
                    }
                ),
                ConnectionGuideStep(
                    label = "Aircraft linked",
                    passed = aircraftReady,
                    detail = when {
                        !controllerReady -> "先完成 RC 連線，再檢查 aircraft linked。"
                        !hardware.aircraftConnected -> "RC 已接上，但 aircraft 尚未 linked。"
                        else -> listOfNotNull(
                            "Aircraft connected",
                            hardware.productType,
                            hardware.firmwareVersion?.let { "firmware $it" }
                        ).joinToString(" / ")
                    }
                ),
                ConnectionGuideStep(
                    label = "Main camera stream",
                    passed = cameraReady,
                    detail = if (aircraftReady) cameraStatusDetail(stream) else "等待 aircraft connected 後再檢查主相機串流。"
                ),
                ConnectionGuideStep(
                    label = "DJI SDK / firmware prerequisite",
                    passed = djiPrereqReady,
                    detail = djiPrerequisiteDetail(sdkState, hardware.aircraftConnected, hardware.firmwareVersion)
                ),
                ConnectionGuideStep(
                    label = "GPS / positioning",
                    passed = gpsPassed,
                    detail = when {
                        !aircraftReady -> "等待 aircraft connected 後再檢查 GPS。"
                        hardware.gpsReady -> "GPS signal ${hardware.gpsSignalLevel} with ${hardware.gpsSatelliteCount} satellites"
                        gpsBlocking -> "GPS signal ${hardware.gpsSignalLevel ?: "UNKNOWN"} with ${hardware.gpsSatelliteCount} satellites"
                        else -> "Indoor no-GPS mode: ${hardware.gpsSignalLevel ?: "UNKNOWN"} with ${hardware.gpsSatelliteCount} satellites (diagnostic only)"
                    }
                )
            ),
            canContinueToPreflight = missionReady && controllerReady && aircraftReady && cameraReady && djiPrereqReady,
            fallbackNote = if (operationProfile == OperationProfile.INDOOR_NO_GPS) {
                "Indoor no-GPS 是正式 operating profile；GPS 只做診斷，RTH 不可用。"
            } else {
                "DJI account 狀態僅作診斷，不作為日常 preflight gate。"
            }
        )
    }

    fun evaluatePreflight(
        missionBundle: MissionBundle?,
        consoleMode: OperatorConsoleMode = OperatorConsoleMode.OUTDOOR_PATROL,
        operationProfile: OperationProfile = consoleMode.executedOperatingProfile,
        indoorConfirmationState: IndoorNoGpsConfirmationState = IndoorNoGpsConfirmationState()
    ): PreflightEvaluation {
        val effectiveConsoleMode = resolveConsoleMode(consoleMode, operationProfile)
        val hardware = hardwareStatusProvider.currentSnapshot()
        val stream = cameraStreamAdapter.status()
        val bundleVerified = missionBundle?.isVerified() == true

        return preflightGatePolicy.evaluate(
            PreflightSnapshot(
                aircraftConnected = hardware.aircraftConnected,
                remoteControllerConnected = hardware.remoteControllerConnected,
                cameraStreamAvailable = stream.available,
                cameraStreamDetail = cameraStatusDetail(stream),
                availableStorageBytes = storageRepository.availableBytes(),
                minimumStorageBytes = minimumStorageBytes,
                deviceHealthBlocking = hardware.deviceHealth.blocking,
                deviceHealthMessage = hardware.deviceHealth.summary,
                flyZoneBlocking = hardware.flyZone.blocking,
                flyZoneMessage = hardware.flyZone.summary,
                gpsReady = hardware.gpsReady,
                gpsDetail = hardware.gpsSignalLevel?.let { "GPS signal $it with ${hardware.gpsSatelliteCount} satellites" },
                missionBundlePresent = missionBundle?.isArtifactComplete() == true,
                missionBundleVerified = bundleVerified,
                consoleMode = effectiveConsoleMode,
                missionContextMode = effectiveConsoleMode.resolveMissionContextMode(bundleVerified),
                operationProfile = operationProfile,
                indoorConfirmationState = indoorConfirmationState
            )
        )
    }

    private fun resolveConsoleMode(
        consoleMode: OperatorConsoleMode,
        operationProfile: OperationProfile,
    ): OperatorConsoleMode {
        return if (consoleMode.executedOperatingProfile == operationProfile) {
            consoleMode
        } else {
            when (operationProfile) {
                OperationProfile.INDOOR_NO_GPS -> OperatorConsoleMode.INDOOR_MANUAL
                OperationProfile.OUTDOOR_GPS_REQUIRED -> consoleMode
            }
        }
    }

    private fun cameraStatusDetail(stream: CameraStreamStatus): String {
        return when {
            stream.available -> {
                val selected = stream.selectedCameraIndex?.let { " ($it)" } ?: ""
                "Camera stream available$selected"
            }
            stream.lastError != null -> "Camera stream manager error: ${stream.lastError}"
            stream.startupTimedOut -> "Camera stream startup timed out"
            !stream.sourceAvailable -> "Main camera not available"
            else -> "Camera stream connected but no frames received"
        }
    }

    private fun djiPrerequisiteDetail(
        sdkState: SdkSessionState,
        aircraftConnected: Boolean,
        firmwareVersion: String?
    ): String {
        return when {
            !sdkState.initialized -> "DJI SDK 尚未初始化。"
            !sdkState.registered -> "DJI SDK 尚未完成註冊；請確認 App Key、第一次啟動網路與系統權限。"
            aircraftConnected && firmwareVersion.isNullOrBlank() ->
                "Aircraft 已連上，但讀不到 firmware version；請先確認 activation / firmware bootstrap。"
            else -> "DJI SDK 與 firmware prerequisite 已就緒。"
        }
    }
}
