package com.yourorg.buildingdrone.app

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.hardware.usb.UsbManager
import android.os.Bundle
import android.os.Build
import android.view.TextureView
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.yourorg.buildingdrone.core.GeoPoint
import com.yourorg.buildingdrone.data.ActiveFlightContext
import com.yourorg.buildingdrone.data.BlackboxRecorder
import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.data.MissionSyncResult
import com.yourorg.buildingdrone.data.auth.LogoutResult
import com.yourorg.buildingdrone.data.network.TelemetrySampleWire
import com.yourorg.buildingdrone.data.upload.UploadBacklogSnapshot
import com.yourorg.buildingdrone.dji.CameraControlStatus
import com.yourorg.buildingdrone.dji.CameraStreamStatus
import com.yourorg.buildingdrone.dji.HardwareSnapshot
import com.yourorg.buildingdrone.dji.PerceptionSnapshot
import com.yourorg.buildingdrone.dji.SimulatorScenario
import com.yourorg.buildingdrone.dji.SimulatorScenarioHarness
import com.yourorg.buildingdrone.dji.SimulatorScenarioReplay
import com.yourorg.buildingdrone.dji.SimulatorStatus
import com.yourorg.buildingdrone.dji.VirtualStickCommand
import com.yourorg.buildingdrone.dji.VirtualStickWindow
import com.yourorg.buildingdrone.domain.operations.ExecutionMode
import com.yourorg.buildingdrone.domain.operations.IndoorNoGpsConfirmationState
import com.yourorg.buildingdrone.domain.operations.OperationProfile
import com.yourorg.buildingdrone.domain.statemachine.FlightEventType
import com.yourorg.buildingdrone.domain.statemachine.FlightStage
import com.yourorg.buildingdrone.feature.manualpilot.ManualPilotUiState
import com.yourorg.buildingdrone.feature.auth.OperatorLoginScreen
import com.yourorg.buildingdrone.feature.transit.TransitUiState
import com.yourorg.buildingdrone.ui.BuildingDroneTheme
import com.yourorg.buildingdrone.ui.ConsoleHomeScreen
import com.yourorg.buildingdrone.ui.ScreenDataState
import androidx.core.content.ContextCompat
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant

class MainActivity : ComponentActivity() {
    private val runtimePermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            (application as? BuildingDroneApplication)?.container?.mobileSdkSession?.retryRegistration()
        }
    private var usbAccessoryIntentToken by mutableStateOf(0)

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        usbAccessoryIntentToken += 1
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as BuildingDroneApplication).container

        setContent {
            val scope = rememberCoroutineScope()
            var signedIn by remember { mutableStateOf(container.runtimeMode == RuntimeMode.DEMO) }
            var username by remember { mutableStateOf("") }
            var password by remember { mutableStateOf("") }
            var loginLoading by remember { mutableStateOf(false) }
            var loginError by remember { mutableStateOf<String?>(null) }
            var logoutLoading by remember { mutableStateOf(false) }
            var showLogoutConfirmation by remember { mutableStateOf(false) }
            var activeFlightContext by remember { mutableStateOf<ActiveFlightContext?>(null) }
            var lastUploadedEventKey by remember { mutableStateOf<String?>(null) }
            var attachedBundle by remember { mutableStateOf<MissionBundle?>(null) }
            var lastIncidentExportKey by remember { mutableStateOf<String?>(null) }
            var previewTextureView by remember { mutableStateOf<TextureView?>(null) }
            var manualLeftX by remember { mutableFloatStateOf(0f) }
            var manualLeftY by remember { mutableFloatStateOf(0f) }
            var manualRightX by remember { mutableFloatStateOf(0f) }
            var manualRightY by remember { mutableFloatStateOf(0f) }
            var manualPilotRefreshTick by remember { mutableStateOf(0) }
            var usbAccessoryAttached by remember {
                mutableStateOf(isUsbAccessoryAttached(this@MainActivity, intent))
            }
            var usbGuideMessage by remember { mutableStateOf<String?>(null) }
            val refreshUsbAccessoryState = {
                val detected = isUsbAccessoryAttached(this@MainActivity, this@MainActivity.intent)
                usbAccessoryAttached = detected
                if (detected) {
                    usbGuideMessage = null
                }
                detected
            }
            var simulatorStatus by remember { mutableStateOf(SimulatorStatus()) }
            var simulatorObservedThisSession by remember { mutableStateOf(false) }
            var branchSimulatorReplay by remember { mutableStateOf<SimulatorScenarioReplay?>(null) }
            var inspectionSimulatorReplay by remember { mutableStateOf<SimulatorScenarioReplay?>(null) }
            var simulatorVerificationError by remember { mutableStateOf<String?>(null) }
            val sdkSessionState by container.mobileSdkSession.state.collectAsState()
            val incidentExportDirectory = remember { application.filesDir.resolve("incident-exports") }
            val blackboxRecorder = remember(container) {
                BlackboxRecorder(
                    repository = container.flightLogRepository,
                    exportDirectory = incidentExportDirectory
                )
            }
            val simulatorHarness = remember(container) {
                SimulatorScenarioHarness(
                    simulatorAdapter = container.simulatorAdapter,
                    reducer = container.flightReducer
                )
            }
            val coordinatorRef = remember { mutableStateOf<DemoMissionCoordinator?>(null) }

            val coordinator = remember(container, scope) {
                DemoMissionCoordinator(
                    reducer = container.flightReducer,
                    runtimeMode = container.runtimeMode,
                    scope = scope,
                    missionLoader = missionLoader@{
                        val session = container.operatorAuthRepository?.currentSession()
                        if (container.runtimeMode == RuntimeMode.PROD && session == null) {
                            return@missionLoader MissionLoadActionResult.Failure(
                                "請先登入 operator account，才能同步 mission bundle。"
                            )
                        }
                        when (val result = container.missionRepository.syncMissionBundle()) {
                            is MissionSyncResult.Success -> {
                                activeFlightContext = result.flightContext
                                attachedBundle = result.bundle
                                MissionLoadActionResult.Success(
                                    bundle = result.bundle,
                                    statusMessage = result.statusMessage,
                                    authStatus = session?.let { "已登入: ${it.displayName} (${it.username})" }
                                )
                            }

                            is MissionSyncResult.Failure -> MissionLoadActionResult.Failure(result.message)
                        }
                    },
                    preflightEvaluator = {
                        container.evaluatePreflight(
                            missionBundle = attachedBundle,
                            operationProfile = coordinatorRef.value?.operationProfile
                                ?: OperationProfile.OUTDOOR_GPS_REQUIRED,
                            indoorConfirmationState = coordinatorRef.value?.indoorConfirmationState
                                ?: IndoorNoGpsConfirmationState()
                        )
                    },
                    syncReporter = syncReporter@{ state ->
                        val uploadRepository = container.flightUploadRepository
                            ?: return@syncReporter NetworkSyncStatus()
                        val flightContext = activeFlightContext
                            ?: return@syncReporter uploadRepository.snapshot().toCoordinatorStatus()
                        val eventType = state.lastEvent
                            ?: return@syncReporter uploadRepository.snapshot().toCoordinatorStatus()
                        val executionSnapshot = coordinatorRef.value?.executionStatusSnapshot
                        if (eventType in setOf(
                                FlightEventType.AUTH_EXPIRED,
                                FlightEventType.AUTH_REFRESHED,
                                FlightEventType.UPLOAD_BACKLOG_UPDATED
                            )
                        ) {
                            return@syncReporter uploadRepository.snapshot().toCoordinatorStatus()
                        }
                        val eventKey = listOf(
                            flightContext.flightId,
                            eventType.name,
                            state.stage.name,
                            state.statusNote ?: "",
                            state.holdReason ?: "",
                            executionSnapshot?.uploadState ?: "",
                            executionSnapshot?.waypointProgress ?: "",
                            executionSnapshot?.landingPhase ?: "",
                            executionSnapshot?.fallbackReason ?: "",
                            executionSnapshot?.plannedOperatingProfile ?: "",
                            executionSnapshot?.executedOperatingProfile ?: "",
                            executionSnapshot?.executionMode ?: "",
                            executionSnapshot?.cameraStreamState ?: "",
                            executionSnapshot?.recordingState ?: "",
                        ).joinToString("|")
                        if (eventKey == lastUploadedEventKey) {
                            return@syncReporter uploadRepository.snapshot().toCoordinatorStatus()
                        }
                        lastUploadedEventKey = eventKey
                        uploadRepository.enqueueFlightEvent(
                            flightId = flightContext.flightId,
                            missionId = flightContext.missionId,
                            eventType = eventType.name,
                            payload = buildMap {
                                put("stage", state.stage.name)
                                put("statusNote", state.statusNote ?: "")
                                put("holdReason", state.holdReason ?: "")
                                put("operatingProfile", executionSnapshot?.operatingProfile ?: "outdoor_gps_patrol")
                                put("plannedOperatingProfile", executionSnapshot?.plannedOperatingProfile ?: "")
                                put("executedOperatingProfile", executionSnapshot?.executedOperatingProfile ?: "")
                                put("executionMode", executionSnapshot?.executionMode ?: "patrol_route")
                                put("executionState", executionSnapshot?.executionState ?: state.stage.name.lowercase())
                                put("uploadState", executionSnapshot?.uploadState ?: if (state.missionUploaded) "uploaded" else "pending_upload")
                                put("waypointProgress", executionSnapshot?.waypointProgress ?: "")
                                put("landingPhase", executionSnapshot?.landingPhase ?: "")
                                put("fallbackReason", executionSnapshot?.fallbackReason ?: "")
                                put("cameraStreamState", executionSnapshot?.cameraStreamState ?: "")
                                put("recordingState", executionSnapshot?.recordingState ?: "")
                                put("missionUploaded", state.missionUploaded.toString())
                            }
                        ).toCoordinatorStatus()
                    },
                    telemetryReporter = telemetryReporter@{ transitState ->
                        val uploadRepository = container.flightUploadRepository
                            ?: return@telemetryReporter NetworkSyncStatus()
                        val flightContext = activeFlightContext
                            ?: return@telemetryReporter uploadRepository.snapshot().toCoordinatorStatus()
                        uploadRepository.enqueueTelemetryBatch(
                            flightId = flightContext.flightId,
                            missionId = flightContext.missionId,
                            samples = listOf(transitState.toTelemetrySample())
                        ).toCoordinatorStatus()
                    },
                    missionUploadExecutor = missionUploadExecutor@{ bundle ->
                        val uploaded = container.waypointMissionAdapter.uploadMission(bundle)
                        CommandActionResult(
                            success = uploaded,
                            message = if (uploaded) {
                                "Mission uploaded."
                            } else {
                                container.waypointMissionAdapter.lastCommandError()
                                    ?: "Mission upload failed."
                            }
                        )
                    },
                    missionStartExecutor = missionStartExecutor@{
                        val started = container.waypointMissionAdapter.startMission()
                        CommandActionResult(
                            success = started,
                            message = if (started) {
                                "Mission started."
                            } else {
                                container.waypointMissionAdapter.lastCommandError()
                                    ?: "Mission start failed."
                            }
                        )
                    },
                    appTakeoffExecutor = {
                        CommandActionResult(
                            success = container.flightControlAdapter.takeoff(),
                            message = container.flightControlAdapter.lastCommandError()
                        )
                    },
                    startAutoLandingExecutor = {
                        CommandActionResult(
                            success = container.flightControlAdapter.startAutoLanding(),
                            message = container.flightControlAdapter.lastCommandError()
                        )
                    },
                    stopAutoLandingExecutor = {
                        CommandActionResult(
                            success = container.flightControlAdapter.stopAutoLanding(),
                            message = container.flightControlAdapter.lastCommandError()
                        )
                    },
                    confirmLandingExecutor = {
                        CommandActionResult(
                            success = container.flightControlAdapter.confirmLanding(),
                            message = container.flightControlAdapter.lastCommandError()
                        )
                    },
                    landingConfirmationNeededProvider = {
                        container.flightControlAdapter.isLandingConfirmationNeeded()
                    },
                    landingVerificationSnapshotProvider = {
                        safeHardwareSnapshot(container)
                    },
                    landingSuitabilityWarningProvider = {
                        val snapshot = safePerceptionSnapshot(container)
                        when {
                            snapshot.hardStopRequired ->
                                "本地感知判定下方環境不適合直接降落。${snapshot.summary ?: ""}".trim()
                            snapshot.obstacleDetected ->
                                "本地感知偵測到障礙物，請先確認降落區域。${snapshot.summary ?: ""}".trim()
                            else -> null
                        }
                    }
                )
            }
            coordinatorRef.value = coordinator

            DisposableEffect(signedIn, attachedBundle, coordinator) {
                val receiver = object : BroadcastReceiver() {
                    override fun onReceive(context: Context?, intent: Intent?) {
                        when (intent?.action) {
                            UsbManager.ACTION_USB_ACCESSORY_ATTACHED -> {
                                usbAccessoryAttached = true
                                usbGuideMessage = null
                                if (container.runtimeMode == RuntimeMode.PROD && signedIn && attachedBundle != null) {
                                    coordinator.openConnectionGuide()
                                }
                            }

                            UsbManager.ACTION_USB_ACCESSORY_DETACHED -> {
                                usbAccessoryAttached = false
                                usbGuideMessage = "遙控器已拔除；重新接回 RC-N2/N3 後再檢查直接連線。"
                                if (container.runtimeMode == RuntimeMode.PROD && signedIn) {
                                    coordinator.openConnectionGuide()
                                }
                            }
                        }
                    }
                }
                val filter = IntentFilter().apply {
                    addAction(UsbManager.ACTION_USB_ACCESSORY_ATTACHED)
                    addAction(UsbManager.ACTION_USB_ACCESSORY_DETACHED)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
                } else {
                    @Suppress("DEPRECATION")
                    registerReceiver(receiver, filter)
                }
                onDispose {
                    unregisterReceiver(receiver)
                }
            }

            DisposableEffect(container) {
                val listenerId = "main-activity-simulator"
                simulatorStatus = safeSimulatorStatus(container)
                if (simulatorStatus.hasObservedStateUpdate()) {
                    simulatorObservedThisSession = true
                }
                runCatching {
                    container.simulatorAdapter.addStateListener(listenerId) { status ->
                        simulatorStatus = status
                        if (status.hasObservedStateUpdate()) {
                            simulatorObservedThisSession = true
                        }
                    }
                }
                onDispose {
                    runCatching { container.simulatorAdapter.removeStateListener(listenerId) }
                }
            }

            LaunchedEffect(usbAccessoryIntentToken) {
                refreshUsbAccessoryState()
            }

            LaunchedEffect(Unit) {
                refreshUsbAccessoryState()
                val cachedBundle = container.missionRepository.loadMissionBundle()
                activeFlightContext = container.missionRepository.loadActiveFlightContext()
                val restoredSession = container.operatorAuthRepository?.currentSession()
                signedIn = restoredSession != null || container.runtimeMode == RuntimeMode.DEMO
                attachedBundle = cachedBundle
                coordinator.attachBundle(
                    bundle = cachedBundle,
                    statusMessage = if (cachedBundle != null) {
                        "已從本機 cache 載入並重新驗證 mission bundle。"
                    } else {
                        null
                    },
                    authStatus = restoredSession?.let { "已登入: ${it.displayName} (${it.username})" }
                        ?: if (container.runtimeMode == RuntimeMode.DEMO) {
                            "Demo mode 不需要 operator token"
                        } else {
                            "尚未登入 operator account"
                        }
                )
                if (
                    container.runtimeMode == RuntimeMode.PROD &&
                    restoredSession != null &&
                    cachedBundle != null &&
                    usbAccessoryAttached
                ) {
                    coordinator.openConnectionGuide()
                }
            }

            LaunchedEffect(signedIn) {
                if (container.runtimeMode != RuntimeMode.PROD || !signedIn) {
                    return@LaunchedEffect
                }
                requestMissingDjiRuntimePermissionsIfNeeded()
                container.mobileSdkSession.retryRegistration()
            }

            LaunchedEffect(
                coordinator.activeScreen,
                coordinator.selectedConsoleMode,
                signedIn,
                attachedBundle?.missionId,
            ) {
                val manualPilotActive =
                    container.runtimeMode == RuntimeMode.PROD &&
                        signedIn &&
                        coordinator.selectedConsoleMode.executionMode == ExecutionMode.MANUAL_PILOT &&
                        coordinator.activeScreen == ConsoleScreen.MANUAL_PILOT

                if (!manualPilotActive) {
                    runCatching { container.virtualStickAdapter.send(VirtualStickCommand()) }
                    runCatching { container.virtualStickAdapter.disable() }
                    manualPilotRefreshTick += 1
                    return@LaunchedEffect
                }

                runCatching { container.cameraStreamAdapter.start() }
                val enabled = runCatching {
                    container.virtualStickAdapter.enable(VirtualStickWindow.OPERATOR_MICRO_ADJUST)
                }.getOrDefault(false)
                manualPilotRefreshTick += 1

                try {
                    while (
                        signedIn &&
                            coordinator.selectedConsoleMode.executionMode == ExecutionMode.MANUAL_PILOT &&
                            coordinator.activeScreen == ConsoleScreen.MANUAL_PILOT
                    ) {
                        if (enabled) {
                            runCatching {
                                container.virtualStickAdapter.send(
                                    buildManualPilotCommand(
                                        leftX = manualLeftX,
                                        leftY = manualLeftY,
                                        rightX = manualRightX,
                                        rightY = manualRightY,
                                    ),
                                )
                            }
                        }
                        manualPilotRefreshTick += 1
                        delay(120)
                    }
                } finally {
                    runCatching { container.virtualStickAdapter.send(VirtualStickCommand()) }
                    runCatching { container.virtualStickAdapter.disable() }
                    manualPilotRefreshTick += 1
                }
            }

            LaunchedEffect(attachedBundle?.missionId) {
                simulatorObservedThisSession = false
                branchSimulatorReplay = null
                inspectionSimulatorReplay = null
                simulatorVerificationError = null
                coordinator.applySimulatorVerification(coordinator.simulatorVerification.copy())
            }

            LaunchedEffect(
                coordinator.activeScreen,
                signedIn,
                attachedBundle,
                coordinator.simulatorVerificationCommandToken
            ) {
                if (container.runtimeMode != RuntimeMode.PROD) {
                    return@LaunchedEffect
                }
                if (!signedIn || attachedBundle == null || !coordinator.showSimulatorVerification) {
                    return@LaunchedEffect
                }

                val bundle = attachedBundle ?: return@LaunchedEffect
                val initialLocation = bundle.simulatorInitialLocation()
                val altitudeMeters = bundle.defaultAltitudeMeters
                simulatorVerificationError = null

                when (coordinator.simulatorVerificationAction) {
                    SimulatorVerificationAction.REFRESH -> Unit

                    SimulatorVerificationAction.ENABLE -> {
                        val enabled = runCatching {
                            container.simulatorAdapter.enable(initialLocation, altitudeMeters)
                        }.getOrDefault(false)
                        simulatorStatus = safeSimulatorStatus(container)
                        if (!enabled) {
                            simulatorVerificationError = container.simulatorAdapter.lastCommandError()
                                ?: "Failed to enable the in-app simulator."
                        }
                    }

                    SimulatorVerificationAction.DISABLE -> {
                        val disabled = runCatching {
                            container.simulatorAdapter.disable()
                        }.getOrDefault(false)
                        simulatorStatus = safeSimulatorStatus(container)
                        if (!disabled) {
                            simulatorVerificationError = container.simulatorAdapter.lastCommandError()
                                ?: "Failed to disable the in-app simulator."
                        }
                    }

                    SimulatorVerificationAction.REPLAY_BRANCH_HOLD_RTH -> {
                        branchSimulatorReplay = runCatching {
                            simulatorHarness.replay(
                                initialLocation = initialLocation,
                                altitudeMeters = altitudeMeters,
                                initialState = simulatorInitialFlightState(),
                                scenario = SimulatorScenario.TRANSIT_BRANCH_HOLD_RTH
                            )
                        }.getOrElse { error ->
                            simulatorVerificationError = "Branch replay failed: ${error.message ?: "unknown error"}"
                            null
                        }
                        branchSimulatorReplay?.let { replay ->
                            if (replay.listenerObserved || replay.enabledSampleObserved) {
                                simulatorObservedThisSession = true
                            }
                            if (!replay.enableSucceeded || !replay.enabledSampleObserved) {
                                simulatorVerificationError = replay.failureReason
                                    ?: "Branch replay did not observe a real simulator sample."
                            }
                        }
                        branchSimulatorReplay?.let { replay ->
                            runCatching {
                                persistSimulatorReplayArtifacts(
                                    recorder = blackboxRecorder,
                                    container = container,
                                    missionId = activeFlightContext?.missionId ?: bundle.missionId,
                                    flightId = activeFlightContext?.flightId,
                                    replay = replay,
                                    reason = "Simulator branch HOLD/RTH replay"
                                )
                            }.onSuccess {
                                lastIncidentExportKey = "simulator|branch|${replay.finalState.stage.name}"
                            }.onFailure { error ->
                                simulatorVerificationError =
                                    "Branch replay artifacts failed: ${error.message ?: "unknown error"}"
                            }
                        }
                    }

                    SimulatorVerificationAction.REPLAY_INSPECTION_CAPTURE -> {
                        inspectionSimulatorReplay = runCatching {
                            simulatorHarness.replay(
                                initialLocation = initialLocation,
                                altitudeMeters = altitudeMeters,
                                initialState = simulatorInitialFlightState(),
                                scenario = SimulatorScenario.TRANSIT_INSPECTION_CAPTURE
                            )
                        }.getOrElse { error ->
                            simulatorVerificationError = "Inspection replay failed: ${error.message ?: "unknown error"}"
                            null
                        }
                        inspectionSimulatorReplay?.let { replay ->
                            if (replay.listenerObserved || replay.enabledSampleObserved) {
                                simulatorObservedThisSession = true
                            }
                            if (!replay.enableSucceeded || !replay.enabledSampleObserved) {
                                simulatorVerificationError = replay.failureReason
                                    ?: "Inspection replay did not observe a real simulator sample."
                            }
                        }
                        inspectionSimulatorReplay?.let { replay ->
                            runCatching {
                                persistSimulatorReplayArtifacts(
                                    recorder = blackboxRecorder,
                                    container = container,
                                    missionId = activeFlightContext?.missionId ?: bundle.missionId,
                                    flightId = activeFlightContext?.flightId,
                                    replay = replay,
                                    reason = "Simulator inspection/capture replay"
                                )
                            }.onSuccess {
                                lastIncidentExportKey = "simulator|inspection|${replay.finalState.stage.name}"
                            }.onFailure { error ->
                                simulatorVerificationError =
                                    "Inspection replay artifacts failed: ${error.message ?: "unknown error"}"
                            }
                        }
                    }
                }
            }

            LaunchedEffect(
                coordinator.activeScreen,
                signedIn,
                attachedBundle,
                coordinator.showSimulatorVerification,
                coordinator.simulatorBenchOnlyFallbackRequested,
                simulatorStatus,
                simulatorObservedThisSession,
                branchSimulatorReplay,
                inspectionSimulatorReplay,
                simulatorVerificationError,
                lastIncidentExportKey
            ) {
                if (container.runtimeMode != RuntimeMode.PROD) {
                    return@LaunchedEffect
                }
                if (!signedIn || attachedBundle == null || !coordinator.showSimulatorVerification) {
                    return@LaunchedEffect
                }

                val state = container.evaluateSimulatorVerification(
                    missionBundle = attachedBundle,
                    simulatorStatus = simulatorStatus,
                    simulatorObservedThisSession = simulatorObservedThisSession,
                    branchReplay = branchSimulatorReplay,
                    inspectionReplay = inspectionSimulatorReplay,
                    benchOnlyFallbackRequested = coordinator.simulatorBenchOnlyFallbackRequested,
                    simulatorCommandError = simulatorVerificationError,
                    blackboxArmed = true,
                    incidentExportObserved = lastIncidentExportKey != null
                )
                val mergedWarning = listOfNotNull(
                    state.warning,
                    simulatorVerificationError
                ).distinct().joinToString(" ").ifBlank { null }
                coordinator.applySimulatorVerification(
                    state.copy(warning = mergedWarning)
                )
            }

            LaunchedEffect(
                coordinator.activeScreen,
                signedIn,
                attachedBundle,
                coordinator.connectionGuideRefreshToken
            ) {
                if (container.runtimeMode != RuntimeMode.PROD) {
                    return@LaunchedEffect
                }
                if (!signedIn || attachedBundle == null || coordinator.activeScreen != ConsoleScreen.CONNECTION_GUIDE) {
                    return@LaunchedEffect
                }
                requestMissingDjiRuntimePermissionsIfNeeded()
                container.mobileSdkSession.retryRegistration()
            }

            LaunchedEffect(
                coordinator.activeScreen,
                signedIn,
                attachedBundle,
                usbAccessoryAttached,
                coordinator.connectionGuideRefreshToken,
                sdkSessionState
            ) {
                if (container.runtimeMode != RuntimeMode.PROD) {
                    return@LaunchedEffect
                }
                if (!signedIn || attachedBundle == null || coordinator.activeScreen != ConsoleScreen.CONNECTION_GUIDE) {
                    return@LaunchedEffect
                }

                coordinator.markConnectionGuideLoading("正在檢查 RC、aircraft 與主相機串流…")
                val observedUsbAccessoryAttached = refreshUsbAccessoryState()
                val hardware = container.hardwareStatusProvider.currentSnapshot()
                val effectiveUsbAccessoryAttached =
                    observedUsbAccessoryAttached || hardware.remoteControllerConnected
                if (effectiveUsbAccessoryAttached && hardware.remoteControllerConnected && hardware.aircraftConnected) {
                    runCatching {
                        container.cameraStreamAdapter.start()
                    }
                }
                val connectionGuideState = container.evaluateConnectionGuide(
                    missionBundle = attachedBundle,
                    sdkState = sdkSessionState,
                    usbAccessoryAttached = effectiveUsbAccessoryAttached,
                    handoffNotice = when {
                        !observedUsbAccessoryAttached && hardware.remoteControllerConnected ->
                            "本機尚未觀察到 USB attach intent，但 DJI SDK 已回報 RC connected。"
                        !observedUsbAccessoryAttached -> usbGuideMessage
                        else -> null
                    },
                    operationProfile = coordinator.operationProfile
                )
                val sdkDiagnostic = sdkSessionState.lastError?.takeIf {
                    !sdkSessionState.registered || !sdkSessionState.initialized
                }
                coordinator.applyConnectionGuide(
                    connectionGuideState.copy(
                        warning = listOfNotNull(connectionGuideState.warning, sdkDiagnostic)
                            .distinct()
                            .joinToString("\n")
                            .ifBlank { null }
                    )
                )
                if (effectiveUsbAccessoryAttached) {
                    usbGuideMessage = null
                }
            }

            LaunchedEffect(coordinator.activeScreen, signedIn, attachedBundle) {
                if (container.runtimeMode != RuntimeMode.PROD) {
                    return@LaunchedEffect
                }
                if (!signedIn || attachedBundle == null || coordinator.activeScreen != ConsoleScreen.PREFLIGHT) {
                    return@LaunchedEffect
                }
                coordinator.markPreflightBootstrap("正在檢查主相機串流…")
                runCatching {
                    container.cameraStreamAdapter.start()
                }
                coordinator.refreshPreflightChecklist()
            }

            LaunchedEffect(
                coordinator.flightState.stage,
                coordinator.flightState.lastEvent,
                coordinator.flightState.holdReason,
                activeFlightContext,
                attachedBundle
            ) {
                val state = coordinator.flightState
                val missionId = activeFlightContext?.missionId ?: attachedBundle?.missionId
                val flightId = activeFlightContext?.flightId
                blackboxRecorder.record(
                    missionId = missionId,
                    flightId = flightId,
                    state = state,
                    hardwareSnapshot = safeHardwareSnapshot(container),
                    perceptionSnapshot = safePerceptionSnapshot(container),
                    simulatorStatus = safeSimulatorStatus(container)
                )

                val exportKey = if (state.stage in setOf(
                        FlightStage.HOLD,
                        FlightStage.RTH,
                        FlightStage.MANUAL_OVERRIDE,
                        FlightStage.ABORTED,
                        FlightStage.COMPLETED
                    ) && state.lastEvent !in setOf(
                        FlightEventType.AUTH_EXPIRED,
                        FlightEventType.AUTH_REFRESHED,
                        FlightEventType.UPLOAD_BACKLOG_UPDATED
                    )
                ) {
                    listOf(
                        missionId ?: "no-mission",
                        flightId ?: "no-flight",
                        state.stage.name,
                        state.lastEvent?.name ?: "no-event",
                        state.holdReason ?: "no-reason"
                    ).joinToString("|")
                } else {
                    null
                }

                if (exportKey != null && exportKey != lastIncidentExportKey) {
                    runCatching {
                        blackboxRecorder.exportIncident(
                            missionId = missionId,
                            flightId = flightId,
                            stage = state.stage,
                            reason = state.holdReason ?: coordinator.emergency.reason
                        )
                    }.onSuccess {
                        lastIncidentExportKey = exportKey
                    }
                }
            }

            val logoutEnabled =
                container.runtimeMode == RuntimeMode.PROD &&
                    coordinator.flightState.stage.allowsOperatorLogout() &&
                    !logoutLoading

            val cameraStreamStatus = remember(
                coordinator.activeScreen,
                manualPilotRefreshTick,
                previewTextureView,
            ) {
                runCatching { container.cameraStreamAdapter.status() }.getOrDefault(CameraStreamStatus())
            }
            val cameraControlStatus = remember(
                coordinator.activeScreen,
                manualPilotRefreshTick,
            ) {
                runCatching { container.cameraControlAdapter.status() }.getOrDefault(CameraControlStatus())
            }
            val manualPilotState = remember(
                coordinator.selectedConsoleMode,
                coordinator.flightState.stage,
                coordinator.flightState.statusNote,
                coordinator.flightState.holdReason,
                coordinator.supportsReturnToHome,
                cameraStreamStatus,
                cameraControlStatus,
                manualPilotRefreshTick,
            ) {
                val previewAvailable =
                    cameraStreamStatus.available || cameraStreamStatus.sourceAvailable || previewTextureView != null
                val cameraStreamState = when {
                    cameraStreamStatus.streaming -> "streaming"
                    previewAvailable -> "ready"
                    cameraStreamStatus.lastError != null -> "error"
                    else -> "unavailable"
                }
                val recordingState = if (cameraControlStatus.recording) "recording" else "idle"
                ManualPilotUiState(
                    status = when {
                        coordinator.flightState.stage == FlightStage.MANUAL_OVERRIDE -> ScreenDataState.SUCCESS
                        coordinator.flightState.stage == FlightStage.HOVER_READY -> ScreenDataState.PARTIAL
                        coordinator.flightState.stage == FlightStage.COMPLETED -> ScreenDataState.SUCCESS
                        else -> ScreenDataState.EMPTY
                    },
                    consoleLabel = coordinator.selectedConsoleMode.displayLabel,
                    summary = when (coordinator.selectedConsoleMode) {
                        com.yourorg.buildingdrone.domain.operations.OperatorConsoleMode.INDOOR_MANUAL ->
                            "室內手動飛行。保留即時影像、雙搖桿、降落與接管，不啟用自動巡邏。"
                        com.yourorg.buildingdrone.domain.operations.OperatorConsoleMode.OUTDOOR_MANUAL_PILOT ->
                            "室外手動飛行。保留相機預覽、雙搖桿與 RTH；不啟用 waypoint patrol。"
                        else ->
                            "手動飛行控台已啟用。"
                    },
                    warning = cameraStreamStatus.lastError ?: cameraControlStatus.lastError,
                    nextStep = coordinator.flightState.statusNote
                        ?: if (coordinator.flightState.stage == FlightStage.HOVER_READY) {
                            "可進入 Manual Pilot。離開畫面即停止 stick stream。"
                        } else {
                            "先完成起飛與穩定 hover，再進入手動飛行。"
                        },
                    previewAvailable = previewAvailable,
                    previewStreaming = cameraStreamStatus.streaming,
                    cameraStreamState = cameraStreamState,
                    recording = cameraControlStatus.recording,
                    recordingState = recordingState,
                    gimbalPitchLabel = String.format("%.1f°", cameraControlStatus.gimbalPitchDegrees),
                    telemetry = listOf(
                        com.yourorg.buildingdrone.feature.transit.TelemetryField(
                            label = "Flight stage",
                            value = coordinator.currentStageLabel,
                        ),
                        com.yourorg.buildingdrone.feature.transit.TelemetryField(
                            label = "Stick window",
                            value = if (coordinator.activeScreen == ConsoleScreen.MANUAL_PILOT) {
                                container.virtualStickAdapter.status().activeWindow?.name ?: "inactive"
                            } else {
                                "inactive"
                            },
                        ),
                        com.yourorg.buildingdrone.feature.transit.TelemetryField(
                            label = "Aircraft",
                            value = if (safeHardwareSnapshot(container).aircraftConnected) "connected" else "disconnected",
                        ),
                        com.yourorg.buildingdrone.feature.transit.TelemetryField(
                            label = "RC",
                            value = if (safeHardwareSnapshot(container).remoteControllerConnected) "connected" else "disconnected",
                        ),
                    ),
                    manualAssistHint = "左搖桿：Yaw / 上下。右搖桿：左右平移 / 前後。離開畫面或登出會停止 virtual stick。",
                    canTakePhoto = cameraControlStatus.available,
                    canStartRecording = cameraControlStatus.available && !cameraControlStatus.recording,
                    canStopRecording = cameraControlStatus.available && cameraControlStatus.recording,
                    canTiltUp = cameraControlStatus.available,
                    canTiltDown = cameraControlStatus.available,
                    canReturnToHome = coordinator.supportsReturnToHome,
                )
            }

            LaunchedEffect(
                manualPilotState.cameraStreamState,
                manualPilotState.recordingState,
            ) {
                coordinator.updateMediaStatus(
                    cameraStreamState = manualPilotState.cameraStreamState,
                    recordingState = manualPilotState.recordingState,
                )
            }

            BuildingDroneTheme {
                if (container.runtimeMode == RuntimeMode.PROD && !signedIn) {
                    OperatorLoginScreen(
                        username = username,
                        password = password,
                        loading = loginLoading,
                        error = loginError,
                        onUsernameChange = { username = it },
                        onPasswordChange = { password = it },
                        onLogin = {
                            if (loginLoading) {
                                return@OperatorLoginScreen
                            }
                            loginLoading = true
                            loginError = null
                            scope.launch {
                                val authRepository = container.operatorAuthRepository
                                if (authRepository == null) {
                                    loginError = "Prod auth repository 尚未設定。"
                                    loginLoading = false
                                    return@launch
                                }
                                try {
                                    val session = authRepository.login(username.trim(), password)
                                    signedIn = true
                                    coordinator.updateAuthStatus("已登入: ${session.displayName} (${session.username})")
                                } catch (error: Exception) {
                                    loginError = "登入失敗: ${error.message ?: "unknown error"}"
                                } finally {
                                    loginLoading = false
                                }
                            }
                        }
                    )
                } else {
                    ConsoleHomeScreen(
                        demoCoordinator = coordinator,
                        manualPilotState = manualPilotState,
                        manualPilotPreview = {
                            AndroidView(
                                modifier = Modifier.fillMaxSize(),
                                factory = { context ->
                                    TextureView(context).also { textureView ->
                                        previewTextureView = textureView
                                    }
                                },
                                update = { textureView ->
                                    previewTextureView = textureView
                                    if (coordinator.activeScreen == ConsoleScreen.MANUAL_PILOT) {
                                        runCatching { container.cameraStreamAdapter.bindPreview(textureView) }
                                    }
                                },
                            )
                        },
                        onManualLeftStickChanged = { x, y ->
                            manualLeftX = x
                            manualLeftY = y
                        },
                        onManualLeftStickReleased = {
                            manualLeftX = 0f
                            manualLeftY = 0f
                        },
                        onManualRightStickChanged = { x, y ->
                            manualRightX = x
                            manualRightY = y
                        },
                        onManualRightStickReleased = {
                            manualRightX = 0f
                            manualRightY = 0f
                        },
                        onManualTakePhoto = {
                            scope.launch {
                                container.cameraControlAdapter.takePhoto()
                                manualPilotRefreshTick += 1
                            }
                        },
                        onManualToggleRecording = {
                            scope.launch {
                                if (cameraControlStatus.recording) {
                                    container.cameraControlAdapter.stopRecording()
                                } else {
                                    container.cameraControlAdapter.startRecording()
                                }
                                manualPilotRefreshTick += 1
                            }
                        },
                        onManualTiltUp = {
                            scope.launch {
                                container.cameraControlAdapter.adjustGimbalPitch(-8.0)
                                manualPilotRefreshTick += 1
                            }
                        },
                        onManualTiltDown = {
                            scope.launch {
                                container.cameraControlAdapter.adjustGimbalPitch(8.0)
                                manualPilotRefreshTick += 1
                            }
                        },
                        onManualReturnToHome = {
                            coordinator.requestRth()
                            manualPilotRefreshTick += 1
                        },
                        showLogoutAction = container.runtimeMode == RuntimeMode.PROD,
                        logoutEnabled = logoutEnabled,
                        logoutInProgress = logoutLoading,
                        onLogoutClick = { showLogoutConfirmation = true }
                    )
                }

                if (showLogoutConfirmation) {
                    AlertDialog(
                        onDismissRequest = {
                            if (!logoutLoading) {
                                showLogoutConfirmation = false
                            }
                        },
                        title = { Text("\u767b\u51fa operator") },
                        text = {
                            Text(
                                "\u9019\u6703\u6e05\u9664\u672c\u6a5f\u767b\u5165\u72c0\u614b\u8207\u672c\u6a5f mission bundle\u3002"
                            )
                        },
                        confirmButton = {
                            TextButton(
                                onClick = {
                                    if (logoutLoading) {
                                        return@TextButton
                                    }
                                    logoutLoading = true
                                    showLogoutConfirmation = false
                                    scope.launch {
                                        var warningMessage: String? = null
                                        try {
                                            warningMessage = when (val result = container.operatorAuthRepository?.logout()) {
                                                is LogoutResult.Success -> null
                                                is LogoutResult.SuccessWithServerRevokeWarning -> result.message
                                                null -> "Signed out locally without an operator auth repository."
                                            }
                                        } catch (error: Exception) {
                                            warningMessage =
                                                "Signed out locally, but auth state cleanup could not be fully verified: ${error.message ?: "unknown error"}"
                                        }

                                        try {
                                            container.missionRepository.clearCachedMissionBundle()
                                        } catch (error: Exception) {
                                            warningMessage = listOfNotNull(
                                                warningMessage,
                                                "Cached mission bundle cleanup failed: ${error.message ?: "unknown error"}"
                                            ).joinToString(" ")
                                        }

                                        attachedBundle = null
                                        activeFlightContext = null
                                        lastUploadedEventKey = null
                                        lastIncidentExportKey = null
                                        branchSimulatorReplay = null
                                        inspectionSimulatorReplay = null
                                        simulatorVerificationError = null
                                        simulatorObservedThisSession = false
                                        coordinator.attachBundle(
                                            bundle = null,
                                            statusMessage = null,
                                            authStatus = null
                                        )
                                        coordinator.selectScreen(ConsoleScreen.MISSION_SETUP)
                                        signedIn = false
                                        password = ""
                                        loginError = warningMessage
                                        logoutLoading = false
                                    }
                                },
                                enabled = !logoutLoading
                            ) {
                                Text(if (logoutLoading) "\u767b\u51fa\u4e2d" else "\u78ba\u8a8d\u767b\u51fa")
                            }
                        },
                        dismissButton = {
                            TextButton(
                                onClick = { showLogoutConfirmation = false },
                                enabled = !logoutLoading
                            ) {
                                Text("\u53d6\u6d88")
                            }
                        }
                    )
                }
            }
        }
    }

    private fun requestMissingDjiRuntimePermissionsIfNeeded() {
        val missingPermissions = djiRuntimePermissions().filterNot { permission ->
            ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED
        }
        if (missingPermissions.isNotEmpty()) {
            runtimePermissionLauncher.launch(missingPermissions.toTypedArray())
        }
    }
}

private fun TransitUiState.toTelemetrySample(): TelemetrySampleWire {
    return TelemetrySampleWire(
        timestamp = Instant.now().toString(),
        lat = 25.03410,
        lng = 121.56470,
        altitudeM = 34.6,
        groundSpeedMps = if (isHold) 0.0 else 3.8,
        batteryPct = 78,
        flightState = stateLabel,
        corridorDeviationM = if (status.name == "PARTIAL") 1.2 else 0.4
    )
}

private fun MissionBundle.simulatorInitialLocation(): GeoPoint {
    return launchPoint.location
}

private fun simulatorInitialFlightState(): com.yourorg.buildingdrone.domain.statemachine.FlightState {
    return com.yourorg.buildingdrone.domain.statemachine.FlightState(
        stage = FlightStage.TRANSIT,
        missionUploaded = true
    )
}

private suspend fun persistSimulatorReplayArtifacts(
    recorder: BlackboxRecorder,
    container: AppContainer,
    missionId: String,
    flightId: String?,
    replay: SimulatorScenarioReplay,
    reason: String
) {
    recorder.record(
        missionId = missionId,
        flightId = flightId,
        state = replay.finalState,
        hardwareSnapshot = safeHardwareSnapshot(container),
        perceptionSnapshot = safePerceptionSnapshot(container),
        simulatorStatus = replay.simulatorSamples.lastOrNull() ?: safeSimulatorStatus(container)
    )
    recorder.exportIncident(
        missionId = missionId,
        flightId = flightId,
        stage = replay.finalState.stage,
        reason = reason
    )
}

private fun safeHardwareSnapshot(container: AppContainer): HardwareSnapshot {
    return runCatching { container.hardwareStatusProvider.currentSnapshot() }
        .getOrDefault(HardwareSnapshot())
}

private fun safePerceptionSnapshot(container: AppContainer): PerceptionSnapshot {
    return runCatching { container.perceptionAdapter.currentSnapshot() }
        .getOrDefault(PerceptionSnapshot())
}

private fun safeSimulatorStatus(container: AppContainer): SimulatorStatus {
    return runCatching { container.simulatorAdapter.status() }
        .getOrDefault(SimulatorStatus())
}

private fun SimulatorStatus.hasObservedStateUpdate(): Boolean {
    return location != null || altitudeMeters != 0.0 || satelliteCount > 0
}

private fun UploadBacklogSnapshot.toCoordinatorStatus(): NetworkSyncStatus {
    return NetworkSyncStatus(
        authValid = authValid,
        pendingEventUploads = pendingEventUploads,
        pendingTelemetryUploads = pendingTelemetryUploads,
        statusNote = statusNote
    )
}

private fun isUsbAccessoryAttached(context: Context, launchIntent: Intent?): Boolean {
    val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    return usbManager.accessoryList?.isNotEmpty() == true ||
        launchIntent?.action == UsbManager.ACTION_USB_ACCESSORY_ATTACHED
}

private fun FlightStage.allowsOperatorLogout(): Boolean {
    return this in setOf(
        FlightStage.IDLE,
        FlightStage.PRECHECK,
        FlightStage.MISSION_READY,
        FlightStage.COMPLETED,
        FlightStage.ABORTED
    )
}

private fun djiRuntimePermissions(): List<String> {
    val permissions = mutableListOf(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
        Manifest.permission.READ_PHONE_STATE,
        Manifest.permission.RECORD_AUDIO
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        permissions += Manifest.permission.BLUETOOTH_CONNECT
        permissions += Manifest.permission.BLUETOOTH_SCAN
    }
    return permissions
}

private fun buildManualPilotCommand(
    leftX: Float,
    leftY: Float,
    rightX: Float,
    rightY: Float,
): VirtualStickCommand {
    return VirtualStickCommand(
        pitch = (-rightY * 2.0f).coerceIn(-2.0f, 2.0f),
        roll = (rightX * 2.0f).coerceIn(-2.0f, 2.0f),
        yaw = (leftX * 40.0f).coerceIn(-40.0f, 40.0f),
        throttle = (-leftY * 1.2f).coerceIn(-1.2f, 1.2f),
    )
}
