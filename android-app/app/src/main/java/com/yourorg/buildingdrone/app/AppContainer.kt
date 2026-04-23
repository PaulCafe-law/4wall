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
import com.yourorg.buildingdrone.dji.FakeSimulatorAdapter
import com.yourorg.buildingdrone.dji.FakeVirtualStickAdapter
import com.yourorg.buildingdrone.dji.FakeWaypointMissionAdapter
import com.yourorg.buildingdrone.dji.FlightControlAdapter
import com.yourorg.buildingdrone.dji.HardwareStatusProvider
import com.yourorg.buildingdrone.dji.MobileSdkSession
import com.yourorg.buildingdrone.dji.PerceptionAdapter
import com.yourorg.buildingdrone.dji.SdkSessionState
import com.yourorg.buildingdrone.dji.SimulatorAdapter
import com.yourorg.buildingdrone.dji.SimulatorScenarioReplay
import com.yourorg.buildingdrone.dji.SimulatorStatus
import com.yourorg.buildingdrone.dji.VirtualStickAdapter
import com.yourorg.buildingdrone.dji.WaypointMissionAdapter
import com.yourorg.buildingdrone.domain.operations.IndoorNoGpsConfirmationState
import com.yourorg.buildingdrone.domain.operations.OperationProfile
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
import com.yourorg.buildingdrone.domain.statemachine.FlightStage
import com.yourorg.buildingdrone.feature.connection.ConnectionGuideStep
import com.yourorg.buildingdrone.feature.connection.ConnectionGuideUiState
import com.yourorg.buildingdrone.feature.simulator.SimulatorVerificationChecklistItem
import com.yourorg.buildingdrone.feature.simulator.SimulatorVerificationUiState
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
    val simulatorAdapter: SimulatorAdapter,
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
        perceptionAdapter = FakePerceptionAdapter(),
        simulatorAdapter = FakeSimulatorAdapter()
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
        operationProfile: OperationProfile = OperationProfile.OUTDOOR_GPS_REQUIRED
    ): ConnectionGuideUiState {
        val hardware = hardwareStatusProvider.currentSnapshot()
        val stream = cameraStreamAdapter.status()
        val missionReady = missionBundle?.isVerified() == true
        val controllerReady = hardware.remoteControllerConnected
        val aircraftReady = controllerReady && hardware.aircraftConnected
        val cameraReady = aircraftReady && stream.available
        val gpsBlocking = operationProfile == OperationProfile.OUTDOOR_GPS_REQUIRED
        val gpsPassed = !gpsBlocking || hardware.gpsReady
        val djiPrereqReady = when {
            !sdkState.initialized -> false
            !sdkState.registered -> false
            aircraftReady && hardware.firmwareVersion.isNullOrBlank() -> false
            else -> true
        }

        val blockers = buildList {
            if (!missionReady) {
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

    fun evaluateSimulatorVerification(
        missionBundle: MissionBundle?,
        simulatorStatus: SimulatorStatus,
        simulatorObservedThisSession: Boolean = false,
        branchReplay: SimulatorScenarioReplay?,
        inspectionReplay: SimulatorScenarioReplay?,
        benchOnlyFallbackRequested: Boolean = false,
        simulatorCommandError: String? = null,
        blackboxArmed: Boolean = runtimeMode == RuntimeMode.PROD,
        incidentExportObserved: Boolean = false
    ): SimulatorVerificationUiState {
        val missionReady = missionBundle?.isVerified() == true
        val branchExpected = listOf(
            FlightStage.TRANSIT,
            FlightStage.BRANCH_VERIFY,
            FlightStage.HOLD,
            FlightStage.RTH
        )
        val inspectionExpected = listOf(
            FlightStage.TRANSIT,
            FlightStage.APPROACH_VIEWPOINT,
            FlightStage.VIEW_ALIGN,
            FlightStage.CAPTURE,
            FlightStage.HOLD
        )
        val branchSequencePassed = branchReplay?.visitedStages == branchExpected
        val inspectionSequencePassed = inspectionReplay?.visitedStages == inspectionExpected
        val branchObserved = branchReplay?.let { it.enableSucceeded && (it.listenerObserved || it.enabledSampleObserved) } == true
        val inspectionObserved = inspectionReplay?.let { it.enableSucceeded && (it.listenerObserved || it.enabledSampleObserved) } == true
        val branchPassed = branchSequencePassed && branchObserved
        val inspectionPassed = inspectionSequencePassed && inspectionObserved
        val simulatorObserved = simulatorObservedThisSession
        val combinedSimulatorErrors = listOfNotNull(
            simulatorCommandError,
            branchReplay?.failureReason,
            inspectionReplay?.failureReason
        )
        val simulatorUnsupported = combinedSimulatorErrors.any {
            val normalized = it.lowercase()
            normalized.contains("request_handler_not_found") && normalized.contains("startsimulator")
        }

        val simulatorStatusLabel = when {
            simulatorUnsupported -> simulatorCommandError
                ?: combinedSimulatorErrors.firstOrNull()
                ?: "DJI MSDK simulator is unavailable on this aircraft / firmware combination."

            simulatorObserved && simulatorStatus.location != null ->
                "Enabled at ${simulatorStatus.location.lat}, ${simulatorStatus.location.lng} / alt ${simulatorStatus.altitudeMeters}m / sats ${simulatorStatus.satelliteCount}"

            simulatorObserved -> "Listener active. Latest simulator sample is idle."
            else -> "No simulator state observed yet."
        }

        val branchDetail = when {
            simulatorUnsupported -> "Not applicable: the in-app MSDK simulator is unavailable on this aircraft / firmware combination."
            branchReplay == null -> "Run the Transit -> Branch -> HOLD -> RTH replay."
            !branchReplay.enableSucceeded -> branchReplay.failureReason ?: "Replay could not enable the in-app simulator."
            !branchObserved -> branchReplay.failureReason ?: "Replay visited reducer stages, but no real MSDK simulator state was observed."
            branchPassed -> "Visited ${branchReplay.visitedStages.joinToString(" -> ")}."
            else -> "Expected ${branchExpected.joinToString(" -> ")}, got ${branchReplay.visitedStages.joinToString(" -> ")}."
        }

        val inspectionDetail = when {
            simulatorUnsupported -> "Not applicable: the in-app MSDK simulator is unavailable on this aircraft / firmware combination."
            inspectionReplay == null -> "Run the Transit -> Approach -> View Align -> Capture replay."
            !inspectionReplay.enableSucceeded -> inspectionReplay.failureReason ?: "Replay could not enable the in-app simulator."
            !inspectionObserved -> inspectionReplay.failureReason ?: "Replay visited reducer stages, but no real MSDK simulator state was observed."
            inspectionPassed -> "Visited ${inspectionReplay.visitedStages.joinToString(" -> ")}."
            else -> "Expected ${inspectionExpected.joinToString(" -> ")}, got ${inspectionReplay.visitedStages.joinToString(" -> ")}."
        }

        val blackboxDetail = when {
            simulatorUnsupported -> "Keep blackbox and operator notes, but do not treat simulator artifacts as available evidence on this hardware path."
            !blackboxArmed -> "Blackbox recorder is not armed in the current runtime."
            !incidentExportObserved ->
                "Blackbox recorder is armed, but no incident export has been observed yet. Run a replay that produces a HOLD / RTH artifact and verify the export lands on disk."
            else -> "Blackbox recorder is armed and at least one incident export was observed in this session."
        }

        val warning = listOfNotNull(
            if (benchOnlyFallbackRequested && !simulatorUnsupported) {
                "Operator selected the explicit props-off bench fallback. Treat this session as bench-only."
            } else {
                null
            },
            if (simulatorUnsupported) {
                "MSDK simulator is unavailable on this aircraft / firmware combination. Record Stage 1 as unavailable, then switch to the props-off bench fallback."
            } else {
                null
            },
            if (!simulatorObserved && (branchReplay != null || inspectionReplay != null)) {
                "MSDK simulator listener is still pending. Reducer-only replay evidence does not satisfy this gate."
            } else {
                null
            },
            simulatorCommandError?.takeIf { it.isNotBlank() },
            branchReplay?.failureReason?.takeIf { !branchPassed && !it.isNullOrBlank() },
            inspectionReplay?.failureReason?.takeIf { !inspectionPassed && !it.isNullOrBlank() }
        ).distinct().joinToString(" ").ifBlank { null }

        val checklist = listOf(
            SimulatorVerificationChecklistItem(
                label = "Mission bundle verified",
                passed = missionReady,
                detail = if (missionReady) {
                    "mission.kmz and mission_meta.json are present and verified."
                } else {
                    "Sync and verify a mission bundle before simulator verification."
                }
            ),
            SimulatorVerificationChecklistItem(
                label = "MSDK simulator listener",
                passed = simulatorObserved,
                detail = simulatorStatusLabel
            ),
            SimulatorVerificationChecklistItem(
                label = "Transit -> Branch -> HOLD -> RTH",
                passed = branchPassed,
                detail = branchDetail
            ),
            SimulatorVerificationChecklistItem(
                label = "Transit -> Approach -> View Align -> Capture",
                passed = inspectionPassed,
                detail = inspectionDetail
            ),
            SimulatorVerificationChecklistItem(
                label = "Blackbox / incident export",
                passed = blackboxArmed && incidentExportObserved,
                detail = blackboxDetail
            )
        )

        val benchOnlyFallbackActive = simulatorUnsupported || benchOnlyFallbackRequested
        val propOnBlockedReason = if (benchOnlyFallbackActive) {
            "MSDK simulator is unavailable on this Mini 4 Pro / firmware combination. Continue with props-off bench only; do not upload or take off."
        } else {
            null
        }
        val canContinue = if (benchOnlyFallbackActive) {
            missionReady
        } else {
            missionReady &&
                simulatorObserved &&
                branchPassed &&
                inspectionPassed &&
                blackboxArmed &&
                incidentExportObserved
        }
        val status = when {
            simulatorUnsupported -> ScreenDataState.PARTIAL
            !missionReady -> ScreenDataState.ERROR
            branchReplay != null && !branchPassed -> ScreenDataState.ERROR
            inspectionReplay != null && !inspectionPassed -> ScreenDataState.ERROR
            !blackboxArmed -> ScreenDataState.ERROR
            canContinue -> ScreenDataState.SUCCESS
            simulatorObserved || branchReplay != null || inspectionReplay != null -> ScreenDataState.PARTIAL
            else -> ScreenDataState.EMPTY
        }

        val summary = when {
            benchOnlyFallbackRequested && !simulatorUnsupported ->
                "Simulator was skipped by operator. Continue to props-off bench only."
            simulatorUnsupported ->
                "DJI MSDK simulator is unavailable on this Mini 4 Pro / firmware combination. Record Stage 1 as unavailable, then continue to props-off bench only."
            !missionReady -> "Load and verify a mission bundle before simulator verification."
            !blackboxArmed -> "Blackbox recording is not armed for this runtime."
            !simulatorObserved -> "Enable the in-app simulator and confirm that the app receives state updates."
            !branchPassed || !inspectionPassed ->
                "Run both required simulator replays and confirm each one observes a real MSDK simulator state."
            !incidentExportObserved -> "Confirm at least one incident export before direct aircraft checks."
            canContinue -> "MSDK simulator verification passed. Continue to Connection Guide."
            else -> "Run both required simulator replays and confirm each one observes a real MSDK simulator state."
        }

        val nextStep = when {
            benchOnlyFallbackRequested && !simulatorUnsupported ->
                "Continue to Connection Guide / Preflight for props-off bench only, and keep prop-on blocked."
            simulatorUnsupported ->
                "Record Stage 1 as unavailable, continue to Connection Guide / Preflight for props-off bench only, and keep prop-on blocked."
            !missionReady -> "Return to Mission Setup and sync a verified bundle."
            !simulatorObserved -> "Enable the in-app simulator from this screen, wait for a real listener update, then refresh the gate."
            !branchPassed -> "Run the Transit -> Branch -> HOLD -> RTH replay and require a real simulator sample before trusting it."
            !inspectionPassed -> "Run the Transit -> Approach -> View Align -> Capture replay and require a real simulator sample before trusting it."
            !incidentExportObserved -> "Verify that a replay produced a blackbox-backed incident export on disk."
            else -> "Continue to Connection Guide and verify USB / RC / aircraft gates."
        }

        return SimulatorVerificationUiState(
            status = status,
            summary = summary,
            warning = warning,
            nextStep = nextStep,
            simulatorStatusLabel = simulatorStatusLabel,
            checklist = checklist,
            canActivateBenchOnlyFallback = missionReady && !benchOnlyFallbackActive,
            benchOnlyFallbackActive = benchOnlyFallbackActive,
            propOnBlockedReason = propOnBlockedReason,
            canContinueToConnectionGuide = canContinue,
            continueLabel = if (benchOnlyFallbackActive) {
                "Continue to Connection Guide (Bench Only)"
            } else {
                "Continue to Connection Guide"
            },
            simulatorActionsEnabled = !benchOnlyFallbackActive
        )
    }

    fun evaluatePreflight(
        missionBundle: MissionBundle?,
        operationProfile: OperationProfile = OperationProfile.OUTDOOR_GPS_REQUIRED,
        indoorConfirmationState: IndoorNoGpsConfirmationState = IndoorNoGpsConfirmationState()
    ): PreflightEvaluation {
        val hardware = hardwareStatusProvider.currentSnapshot()
        val stream = cameraStreamAdapter.status()

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
                missionBundleVerified = missionBundle?.isVerified() == true,
                operationProfile = operationProfile,
                indoorConfirmationState = indoorConfirmationState
            )
        )
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
