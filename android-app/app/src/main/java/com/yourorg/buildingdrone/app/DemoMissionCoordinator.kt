package com.yourorg.buildingdrone.app

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.data.demoMissionBundle
import com.yourorg.buildingdrone.dji.HardwareSnapshot
import com.yourorg.buildingdrone.domain.operations.AutonomyCapability
import com.yourorg.buildingdrone.domain.operations.ExecutionMode
import com.yourorg.buildingdrone.domain.operations.IndoorNoGpsConfirmationState
import com.yourorg.buildingdrone.domain.operations.MissionContextMode
import com.yourorg.buildingdrone.domain.operations.OperationProfile
import com.yourorg.buildingdrone.domain.operations.OperatorConsoleMode
import com.yourorg.buildingdrone.domain.safety.PreflightEvaluation
import com.yourorg.buildingdrone.domain.safety.PreflightGateId
import com.yourorg.buildingdrone.domain.safety.PreflightGateResult
import com.yourorg.buildingdrone.domain.statemachine.FlightEventType
import com.yourorg.buildingdrone.domain.statemachine.FlightReducer
import com.yourorg.buildingdrone.domain.statemachine.FlightStage
import com.yourorg.buildingdrone.domain.statemachine.FlightState
import com.yourorg.buildingdrone.feature.branchverify.BranchVerifyUiState
import com.yourorg.buildingdrone.feature.connection.ConnectionGuideUiState
import com.yourorg.buildingdrone.feature.emergency.EmergencyMode
import com.yourorg.buildingdrone.feature.emergency.EmergencyUiState
import com.yourorg.buildingdrone.feature.inspection.InspectionCaptureUiState
import com.yourorg.buildingdrone.feature.mission.MissionSetupUiState
import com.yourorg.buildingdrone.feature.preflight.IndoorConfirmationItem
import com.yourorg.buildingdrone.feature.preflight.PreflightActionState
import com.yourorg.buildingdrone.feature.preflight.PreflightChecklistItem
import com.yourorg.buildingdrone.feature.preflight.PreflightUiState
import com.yourorg.buildingdrone.feature.transit.TelemetryField
import com.yourorg.buildingdrone.feature.transit.TransitUiState
import com.yourorg.buildingdrone.ui.ScreenDataState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

enum class ConsoleScreen(val label: String) {
    MISSION_SETUP("任務設定"),
    CONNECTION_GUIDE("連線指引"),
    PREFLIGHT("起飛前檢查"),
    IN_FLIGHT("主航段"),
    MANUAL_PILOT("手動飛行"),
    BRANCH_CONFIRM("分支確認"),
    INSPECTION("巡檢拍攝"),
    EMERGENCY("異常處理"),
}

sealed interface MissionLoadActionResult {
    data class Success(
        val bundle: MissionBundle,
        val statusMessage: String,
        val authStatus: String? = null,
    ) : MissionLoadActionResult

    data class Failure(val message: String) : MissionLoadActionResult
}

data class NetworkSyncStatus(
    val authValid: Boolean = true,
    val pendingEventUploads: Int = 0,
    val pendingTelemetryUploads: Int = 0,
    val statusNote: String? = null,
)

data class ExecutionStatusSnapshot(
    val operatingProfile: String,
    val plannedOperatingProfile: String? = null,
    val executedOperatingProfile: String,
    val executionMode: String,
    val executionState: String,
    val uploadState: String,
    val waypointProgress: String,
    val landingPhase: String? = null,
    val fallbackReason: String? = null,
    val statusNote: String? = null,
    val holdReason: String? = null,
    val cameraStreamState: String? = null,
    val recordingState: String? = null,
    val missionUploaded: Boolean = false,
)

data class CommandActionResult(
    val success: Boolean,
    val message: String? = null,
)

private enum class LandingPromptSource {
    DJI_CONFIRMATION_REQUIRED,
    LOCAL_PERCEPTION_WARNING,
    DJI_CONFIRMATION_WITH_LOCAL_WARNING,
}

class DemoMissionCoordinator(
    @Suppress("unused") private val reducer: FlightReducer,
    private val runtimeMode: RuntimeMode = RuntimeMode.DEMO,
    private val scope: CoroutineScope? = null,
    private val missionLoader: (suspend () -> MissionLoadActionResult)? = null,
    private val preflightEvaluator: (() -> PreflightEvaluation)? = null,
    private val syncReporter: (suspend (FlightState) -> NetworkSyncStatus)? = null,
    private val telemetryReporter: (suspend (TransitUiState) -> NetworkSyncStatus)? = null,
    private val missionUploadExecutor: (suspend (MissionBundle) -> CommandActionResult)? = null,
    private val missionStartExecutor: (suspend () -> CommandActionResult)? = null,
    private val appTakeoffExecutor: (suspend () -> CommandActionResult)? = null,
    private val startReturnHomeExecutor: (suspend () -> CommandActionResult)? = null,
    private val startAutoLandingExecutor: (suspend () -> CommandActionResult)? = null,
    private val stopAutoLandingExecutor: (suspend () -> CommandActionResult)? = null,
    private val confirmLandingExecutor: (suspend () -> CommandActionResult)? = null,
    private val landingConfirmationNeededProvider: (() -> Boolean)? = null,
    private val landingVerificationSnapshotProvider: (() -> HardwareSnapshot)? = null,
    private val landingSuitabilityWarningProvider: (() -> String?)? = null,
) {
    val currentStageLabel: String
        get() = stageLabel(flightState.stage)

    val supportsReturnToHome: Boolean
        get() = selectedConsoleMode.supportsRth

    val executionStatusSnapshot: ExecutionStatusSnapshot
        get() = ExecutionStatusSnapshot(
            operatingProfile = operationProfile.wireName,
            plannedOperatingProfile = plannedOperatingProfile?.wireName,
            executedOperatingProfile = selectedConsoleMode.executedOperatingProfile.wireName,
            executionMode = selectedConsoleMode.executionMode.wireName,
            executionState = flightState.stage.name.lowercase(),
            uploadState = uploadState(),
            waypointProgress = transit.progressLabel,
            landingPhase = when {
                landingRcOnlyFallbackReason != null -> "rc_only_fallback"
                landingConfirmationPromptActive -> "confirmation_required"
                flightState.stage == FlightStage.LANDING -> "auto_landing"
                flightState.stage == FlightStage.COMPLETED -> "landed"
                else -> null
            },
            fallbackReason = landingRcOnlyFallbackReason,
            statusNote = flightState.statusNote,
            holdReason = flightState.holdReason,
            cameraStreamState = cameraStreamState,
            recordingState = recordingState,
            missionUploaded = flightState.missionUploaded,
        )

    val visibleScreens: List<ConsoleScreen>
        get() = if (runtimeMode == RuntimeMode.PROD) {
            buildList {
                add(ConsoleScreen.MISSION_SETUP)
                add(ConsoleScreen.CONNECTION_GUIDE)
                add(ConsoleScreen.PREFLIGHT)
                add(ConsoleScreen.IN_FLIGHT)
                add(ConsoleScreen.EMERGENCY)
            }
        } else {
            ConsoleScreen.entries.filter { it != ConsoleScreen.CONNECTION_GUIDE }
        }

    val railSecondaryLabel: String
        get() = when {
            supportsReturnToHome -> "返航"
            flightState.stage == FlightStage.MANUAL_OVERRIDE -> "RC 接管中"
            else -> "降落"
        }

    val railSecondaryEnabled: Boolean
        get() = flightState.stage !in setOf(FlightStage.COMPLETED, FlightStage.ABORTED)

    var operationProfile by mutableStateOf(OperationProfile.OUTDOOR_GPS_REQUIRED)
        private set
    var selectedConsoleMode by mutableStateOf(OperatorConsoleMode.OUTDOOR_PATROL)
        private set
    var plannedOperatingProfile by mutableStateOf<OperationProfile?>(null)
        private set
    var indoorConfirmationState by mutableStateOf(IndoorNoGpsConfirmationState())
        private set
    var indoorAutonomyCapability by mutableStateOf(AutonomyCapability.UNKNOWN)
        private set
    var missionBundle by mutableStateOf<MissionBundle?>(null)
        private set
    var flightState by mutableStateOf(FlightState(demoMode = runtimeMode == RuntimeMode.DEMO))
        private set
    var activeScreen by mutableStateOf(ConsoleScreen.MISSION_SETUP)
        private set

    var missionSetup by mutableStateOf(MissionSetupUiState(bundleLoaded = false, demoMode = runtimeMode == RuntimeMode.DEMO))
        private set
    var preflight by mutableStateOf(PreflightUiState(modeLabel = selectedConsoleMode.displayLabel))
        private set
    var connectionGuide by mutableStateOf(ConnectionGuideUiState())
        private set
    var transit by mutableStateOf(
        TransitUiState(
            stateLabel = "待命",
            emergencyVisible = true,
            status = ScreenDataState.EMPTY,
            telemetry = defaultTelemetry(FlightStage.IDLE),
        ),
    )
        private set
    var branchVerify by mutableStateOf(
        BranchVerifyUiState(availableOptions = listOf("LEFT", "STRAIGHT", "RIGHT")),
    )
        private set
    var inspection by mutableStateOf(
        InspectionCaptureUiState(viewpointLabel = "Inspection Viewpoint"),
    )
        private set
    var emergency by mutableStateOf(
        EmergencyUiState(
            reason = "等待 operator 動作",
            status = ScreenDataState.EMPTY,
            mode = EmergencyMode.INFO,
            nextStep = "先完成任務同步與起飛前檢查。",
        ),
    )
        private set

    var connectionGuideRefreshToken by mutableStateOf(0)
        private set

    private var latestPreflightEvaluation: PreflightEvaluation? = null
    private var hoverReadyForMissionStart by mutableStateOf(false)
    private var lastTakeoffPath by mutableStateOf<String?>(null)
    private var landingConfirmationPromptActive by mutableStateOf(false)
    private var landingPromptSource by mutableStateOf<LandingPromptSource?>(null)
    private var landingConfirmationPromptReason by mutableStateOf<String?>(null)
    private var landingRcOnlyFallbackReason by mutableStateOf<String?>(null)
    private var cameraStreamState by mutableStateOf("unavailable")
    private var recordingState by mutableStateOf("idle")
    private var commandInProgress by mutableStateOf(false)

    init {
        refreshMissionSetupProfile()
        refreshConnectionGuidePresentation()
        refreshPreflightPresentation()
        refreshFlightPanels()
    }

    fun attachBundle(
        bundle: MissionBundle?,
        statusMessage: String? = null,
        authStatus: String? = missionSetup.authStatus,
    ) {
        missionBundle = bundle
        plannedOperatingProfile = bundle?.operatingProfile
        if (runtimeMode == RuntimeMode.PROD) {
            selectedConsoleMode = OperatorConsoleMode.OUTDOOR_PATROL
            operationProfile = OperationProfile.OUTDOOR_GPS_REQUIRED
        }
        val bundleVerified = bundle?.isVerified() == true
        val missionContextMode = selectedConsoleMode.resolveMissionContextMode(bundleVerified)
        indoorAutonomyCapability = if (operationProfile == OperationProfile.INDOOR_NO_GPS) {
            AutonomyCapability.UNKNOWN
        } else {
            AutonomyCapability.SUPPORTED
        }
        hoverReadyForMissionStart = false
        lastTakeoffPath = null
        clearLandingFlowState()
        flightState = FlightState(
            stage = FlightStage.IDLE,
            missionId = bundle?.missionId,
            missionBundleLoaded = bundle != null,
            missionBundleVerified = bundleVerified,
            missionContextMode = missionContextMode,
            demoMode = runtimeMode == RuntimeMode.DEMO,
        )
        missionSetup = missionSetup.copy(
            bundleLoaded = bundle != null,
            plannedOperatingProfile = plannedOperatingProfile,
            selectedConsoleMode = selectedConsoleMode,
            selectableConsoleModes = selectableConsoleModes(),
            selectionLocked = activeScreen != ConsoleScreen.MISSION_SETUP,
            status = when {
                bundle == null -> ScreenDataState.EMPTY
                bundle.isVerified() -> ScreenDataState.SUCCESS
                else -> ScreenDataState.ERROR
            },
            missionLabel = bundle?.missionId ?: if (selectedConsoleMode.requiresMissionBundle) {
                "No mission bundle loaded"
            } else {
                "Unplanned manual flight"
            },
            summary = bundle?.let {
                listOf(
                    if (it.launchPoint == null) {
                        "Launch source: DJI Home Point captured at takeoff"
                    } else {
                        "Launch point: ${it.launchPoint.label} / ${it.launchPoint.location.lat}, ${it.launchPoint.location.lng}"
                    },
                    "Waypoint count: ${it.orderedWaypoints.size}",
                    "Return home on finish: ${it.returnHomeOnFinish}",
                    "Altitude / speed: ${it.defaultAltitudeMeters} m / ${it.defaultSpeedMetersPerSecond} m/s",
                    "Planned profile: ${it.operatingProfile.displayLabel}",
                    "Mission source: ${it.missionSource}",
                )
            } ?: emptyList(),
            artifactStatus = when {
                bundle == null && !selectedConsoleMode.requiresMissionBundle ->
                    "No mission bundle is attached. This session will run as unplanned manual flight."
                bundle == null -> "Mission artifacts are missing."
                bundle.isVerified() -> "mission.kmz and mission_meta.json are verified."
                else -> "Mission bundle verification failed."
            },
            warning = statusMessage,
            authStatus = authStatus,
            missionContextMode = missionContextMode,
            canContinue = bundleVerified || !selectedConsoleMode.requiresMissionBundle,
        )
        refreshMissionSetupProfile()
        refreshConnectionGuidePresentation()
        refreshPreflightPresentation()
        refreshFlightPanels()
    }

    fun updateAuthStatus(message: String?) {
        missionSetup = missionSetup.copy(authStatus = message)
    }

    fun updateMediaStatus(
        cameraStreamState: String,
        recordingState: String,
    ) {
        this.cameraStreamState = cameraStreamState
        this.recordingState = recordingState
    }

    fun selectOperationProfile(profile: OperationProfile) {
        selectConsoleMode(OperatorConsoleMode.defaultForProfile(profile))
    }

    fun selectConsoleMode(mode: OperatorConsoleMode) {
        if (activeScreen != ConsoleScreen.MISSION_SETUP) {
            return
        }
        val effectiveMode = if (runtimeMode == RuntimeMode.PROD) {
            OperatorConsoleMode.OUTDOOR_PATROL
        } else {
            mode
        }
        if (runtimeMode == RuntimeMode.PROD && !mode.isProdV1Selectable) {
            selectedConsoleMode = effectiveMode
            operationProfile = effectiveMode.executedOperatingProfile
            refreshMissionSetupProfile()
            refreshConnectionGuidePresentation()
            refreshPreflightPresentation()
            refreshFlightPanels()
            return
        }
        selectedConsoleMode = effectiveMode
        operationProfile = effectiveMode.executedOperatingProfile
        indoorConfirmationState = IndoorNoGpsConfirmationState()
        indoorAutonomyCapability = if (operationProfile == OperationProfile.INDOOR_NO_GPS) {
            AutonomyCapability.UNKNOWN
        } else {
            AutonomyCapability.SUPPORTED
        }
        hoverReadyForMissionStart = false
        lastTakeoffPath = null
        clearLandingFlowState()
        flightState = flightState.copy(
            missionBundleLoaded = missionBundle != null,
            missionBundleVerified = bundleVerified(),
            missionContextMode = currentMissionContextMode(),
        )
        refreshMissionSetupProfile()
        refreshConnectionGuidePresentation()
        refreshPreflightPresentation()
        refreshFlightPanels()
    }

    fun loadMockMission() {
        if (missionLoader != null && scope != null) {
            missionSetup = missionSetup.copy(
                status = ScreenDataState.LOADING,
                warning = "Syncing mission bundle...",
            )
            scope.launch {
                when (val result = missionLoader.invoke()) {
                    is MissionLoadActionResult.Success -> attachBundle(
                        bundle = result.bundle,
                        statusMessage = result.statusMessage,
                        authStatus = result.authStatus,
                    )

                    is MissionLoadActionResult.Failure -> {
                        missionSetup = missionSetup.copy(
                            status = ScreenDataState.ERROR,
                            warning = result.message,
                        )
                        refreshMissionSetupProfile()
                    }
                }
            }
            return
        }

        if (missionLoader != null) {
            when (val result = runBlocking { missionLoader.invoke() }) {
                is MissionLoadActionResult.Success -> attachBundle(
                    bundle = result.bundle,
                    statusMessage = result.statusMessage,
                    authStatus = result.authStatus,
                )

                is MissionLoadActionResult.Failure -> {
                    missionSetup = missionSetup.copy(
                        status = ScreenDataState.ERROR,
                        warning = result.message,
                    )
                    refreshMissionSetupProfile()
                }
            }
            return
        }

        attachBundle(bundle = demoMissionBundle(), statusMessage = "Demo mission bundle loaded.")
    }

    fun continueFromMissionSetup() {
        if (selectedConsoleMode.requiresMissionBundle && !bundleVerified()) {
            missionSetup = missionSetup.copy(
                status = ScreenDataState.ERROR,
                warning = "Load and verify a mission bundle first.",
            )
            refreshMissionSetupProfile()
            return
        }
        if (runtimeMode == RuntimeMode.PROD) {
            openConnectionGuide()
        } else {
            openPreflightChecklist()
        }
    }

    fun openConnectionGuide() {
        if (selectedConsoleMode.requiresMissionBundle && !bundleVerified()) {
            missionSetup = missionSetup.copy(
                status = ScreenDataState.ERROR,
                warning = "Load and verify a mission bundle first.",
            )
            activeScreen = ConsoleScreen.MISSION_SETUP
            refreshMissionSetupProfile()
            return
        }
        activeScreen = ConsoleScreen.CONNECTION_GUIDE
        retryConnectionGuide()
    }

    fun markConnectionGuideLoading(message: String) {
        connectionGuide = connectionGuide.copy(status = ScreenDataState.LOADING, warning = message)
    }

    fun retryConnectionGuide() {
        connectionGuideRefreshToken += 1
        markConnectionGuideLoading("Refreshing USB, RC, aircraft, and camera readiness…")
    }

    fun applyConnectionGuide(state: ConnectionGuideUiState) {
        connectionGuide = state.copy(modeLabel = selectedConsoleMode.displayLabel)
    }

    fun continueFromConnectionGuide() {
        if (!connectionGuide.canContinueToPreflight) {
            connectionGuide = connectionGuide.copy(
                status = ScreenDataState.ERROR,
                warning = "Complete every blocking item before continuing.",
            )
            return
        }
        openPreflightChecklist()
    }

    fun openPreflightChecklist() {
        if (runtimeMode == RuntimeMode.PROD && activeScreen != ConsoleScreen.CONNECTION_GUIDE) {
            openConnectionGuide()
            return
        }
        if (runtimeMode == RuntimeMode.PROD && !connectionGuide.canContinueToPreflight) {
            activeScreen = ConsoleScreen.CONNECTION_GUIDE
            connectionGuide = connectionGuide.copy(
                status = ScreenDataState.ERROR,
                warning = "Complete Connection Guide before opening Preflight.",
            )
            return
        }
        activeScreen = ConsoleScreen.PREFLIGHT
        flightState = flightState.copy(stage = FlightStage.PRECHECK, lastEvent = null)
        refreshPreflightPresentation()
    }

    fun markPreflightBootstrap(message: String) {
        preflight = preflight.copy(status = ScreenDataState.LOADING, warning = message)
    }

    fun refreshPreflightChecklist() {
        refreshPreflightPresentation()
    }

    fun approvePreflight() {
        val evaluation = evaluatePreflight()
        latestPreflightEvaluation = evaluation
        if (!evaluation.canTakeoff) {
            preflight = buildPreflightState(evaluation).copy(
                status = ScreenDataState.ERROR,
                warning = evaluation.profileBlockingReason ?: "Resolve all blocking preflight gates first.",
            )
            return
        }
        flightState = flightState.copy(
            stage = FlightStage.MISSION_READY,
            preflightReady = true,
            lastEvent = FlightEventType.PREFLIGHT_OK,
            missionBundleLoaded = missionBundle != null,
            missionBundleVerified = bundleVerified(),
            missionContextMode = currentMissionContextMode(),
        )
        refreshPreflightPresentation()
        refreshFlightPanels()
    }

    fun uploadAndStartMission() {
        val evaluation = evaluatePreflight()
        if (!evaluation.canTakeoff) {
            preflight = buildPreflightState(evaluation).copy(
                status = ScreenDataState.ERROR,
                warning = "Preflight is still blocking mission execution.",
            )
            return
        }
        when (selectedConsoleMode.executionMode) {
            ExecutionMode.PATROL_ROUTE -> {
                val bundle = missionBundle ?: run {
                    preflight = preflight.copy(
                        status = ScreenDataState.ERROR,
                        warning = "Mission bundle is missing.",
                    )
                    return
                }
                runFlightCommand("正在處理巡邏任務指令，請等待 DJI 回應。") {
                    handlePatrolRouteStart(bundle, evaluation)
                }
            }
            ExecutionMode.MANUAL_PILOT -> handleManualPilotEntry(evaluation)
        }
    }

    fun requestAppTakeoff() {
        val evaluation = evaluatePreflight()
        if (selectedConsoleMode.executionMode == ExecutionMode.PATROL_ROUTE) {
            preflight = buildPreflightState(evaluation).copy(
                status = ScreenDataState.ERROR,
                warning = "Outdoor Patrol uses the DJI waypoint mission for takeoff and climb. Upload the mission, then start the waypoint mission from the ground.",
            )
            return
        }
        if (!evaluation.canTakeoff || flightState.stage !in setOf(FlightStage.MISSION_READY, FlightStage.TAKEOFF)) {
            preflight = buildPreflightState(evaluation).copy(
                status = ScreenDataState.ERROR,
                warning = "Takeoff is still blocked by preflight.",
            )
            return
        }
        runFlightCommand("正在送出 App 起飛指令，請等待 DJI 回應。") {
            handleAppTakeoff(evaluation)
        }
    }

    private suspend fun handleAppTakeoff(evaluation: PreflightEvaluation) {
        val result = executeCommand(appTakeoffExecutor, fallbackMessage = "App takeoff failed.")
        if (!result.success) {
            preflight = buildPreflightState(evaluation).copy(
                status = ScreenDataState.ERROR,
                warning = result.message ?: "App takeoff failed.",
            )
            return
        }
        flightState = flightState.copy(
            stage = FlightStage.HOVER_READY,
            lastEvent = FlightEventType.APP_TAKEOFF_COMPLETED,
            missionContextMode = currentMissionContextMode(),
        )
        hoverReadyForMissionStart = true
        lastTakeoffPath = "app_takeoff"
        refreshPreflightPresentation()
        refreshFlightPanels()
    }

    fun confirmRcHoverReady() {
        val evaluation = evaluatePreflight()
        if (selectedConsoleMode.executionMode == ExecutionMode.PATROL_ROUTE) {
            preflight = buildPreflightState(evaluation).copy(
                status = ScreenDataState.ERROR,
                warning = "Outdoor Patrol must start through the DJI waypoint mission from the ground. Do not confirm RC hover before patrol start.",
            )
            return
        }
        if (!evaluation.canTakeoff || flightState.stage !in setOf(FlightStage.MISSION_READY, FlightStage.TAKEOFF)) {
            preflight = buildPreflightState(evaluation).copy(
                status = ScreenDataState.ERROR,
                warning = "RC hover confirmation is not available yet.",
            )
            return
        }
        flightState = flightState.copy(
            stage = FlightStage.HOVER_READY,
            lastEvent = FlightEventType.RC_HOVER_CONFIRMED,
            missionContextMode = currentMissionContextMode(),
        )
        hoverReadyForMissionStart = true
        lastTakeoffPath = "rc_manual_takeoff"
        refreshPreflightPresentation()
        refreshFlightPanels()
    }

    fun selectScreen(screen: ConsoleScreen) {
        if (screen !in visibleScreens) {
            return
        }
        if (runtimeMode == RuntimeMode.PROD) {
            when (screen) {
                ConsoleScreen.CONNECTION_GUIDE -> {
                    openConnectionGuide()
                    return
                }
                ConsoleScreen.PREFLIGHT -> {
                    openPreflightChecklist()
                    return
                }
                ConsoleScreen.IN_FLIGHT -> {
                    if (flightState.stage !in setOf(
                            FlightStage.TAKEOFF,
                            FlightStage.HOVER_READY,
                            FlightStage.TRANSIT,
                            FlightStage.HOLD,
                            FlightStage.RTH,
                            FlightStage.LANDING,
                            FlightStage.COMPLETED,
                            FlightStage.ABORTED,
                        )
                    ) {
                        return
                    }
                }
                else -> Unit
            }
        }
        activeScreen = screen
    }

    fun toggleIndoorConfirmation(id: String) {
        indoorConfirmationState = when (id) {
            "siteConfirmed" -> indoorConfirmationState.copy(siteConfirmed = !indoorConfirmationState.siteConfirmed)
            "rthUnavailableAcknowledged" -> indoorConfirmationState.copy(
                rthUnavailableAcknowledged = !indoorConfirmationState.rthUnavailableAcknowledged,
            )
            "observerReady" -> indoorConfirmationState.copy(observerReady = !indoorConfirmationState.observerReady)
            "takeoffZoneClear" -> indoorConfirmationState.copy(takeoffZoneClear = !indoorConfirmationState.takeoffZoneClear)
            "manualTakeoverReady" -> indoorConfirmationState.copy(
                manualTakeoverReady = !indoorConfirmationState.manualTakeoverReady,
            )
            else -> indoorConfirmationState
        }
        refreshPreflightPresentation()
    }

    fun replayTelemetry() {
        transit = transit.copy(partialWarning = "Telemetry replay is retained for debug paths only.")
    }

    fun triggerBranchConfirm() {
        activeScreen = ConsoleScreen.BRANCH_CONFIRM
        branchVerify = branchVerify.copy(status = ScreenDataState.PARTIAL, reason = "Debug branch confirmation only.")
    }

    fun confirmBranch(@Suppress("UNUSED_PARAMETER") decision: String) {
        activeScreen = currentMainScreen()
        branchVerify = branchVerify.copy(status = ScreenDataState.SUCCESS, reason = null)
    }

    fun branchTimeout() {
        requestHold()
    }

    fun triggerObstacleWarn() {
        transit = transit.copy(partialWarning = "Obstacle warning injected in debug flow.")
    }

    fun triggerObstacleHardStop() {
        requestHold(reason = "Obstacle hard-stop injected by debug flow.")
    }

    fun clearObstacle() {
        transit = transit.copy(partialWarning = null)
    }

    fun triggerInspectionApproach() {
        if (selectedConsoleMode.executionMode == ExecutionMode.MANUAL_PILOT) {
            transit = transit.copy(partialWarning = "Inspection capture is hidden in prod manual-pilot flow.")
            return
        }
        activeScreen = ConsoleScreen.INSPECTION
        inspection = inspection.copy(reason = "Legacy inspection flow is available only for debug validation.")
    }

    fun alignView() {
        inspection = inspection.copy(alignmentStatus = "View aligned", captureEnabled = true)
    }

    fun captureView() {
        inspection = inspection.copy(captureStatus = ScreenDataState.SUCCESS, nextStep = "Return to the main flight flow.")
    }

    fun requestHold(reason: String? = null) {
        flightState = flightState.copy(
            stage = FlightStage.HOLD,
            lastEvent = FlightEventType.USER_HOLD_REQUESTED,
            holdReason = reason ?: "Operator requested HOLD.",
        )
        activeScreen = ConsoleScreen.EMERGENCY
        refreshFlightPanels()
    }

    fun requestRth() {
        if (!supportsReturnToHome) {
            emergency = EmergencyUiState(
                reason = "Indoor / no-GPS mode does not allow RTH.",
                status = ScreenDataState.PARTIAL,
                mode = EmergencyMode.INFO,
                nextStep = "Use HOLD, LAND, or manual takeover instead.",
                primaryActionEnabled = false,
                secondaryActionEnabled = false,
            )
            activeScreen = ConsoleScreen.EMERGENCY
            return
        }
        val result = runCommand(startReturnHomeExecutor, fallbackMessage = "Return-to-home failed.")
        if (!result.success) {
            emergency = EmergencyUiState(
                reason = result.message ?: "Return-to-home failed.",
                status = ScreenDataState.ERROR,
                mode = EmergencyMode.INFO,
                nextStep = "Enter HOLD or TAKEOVER, then recover with the controller.",
                primaryActionEnabled = false,
                secondaryActionEnabled = true,
            )
            activeScreen = ConsoleScreen.EMERGENCY
            return
        }
        flightState = flightState.copy(
            stage = FlightStage.RTH,
            lastEvent = FlightEventType.USER_RTH_REQUESTED,
            holdReason = null,
        )
        activeScreen = ConsoleScreen.EMERGENCY
        refreshFlightPanels()
    }

    fun requestLand() {
        val result = runCommand(startAutoLandingExecutor, fallbackMessage = "Auto landing failed.")
        if (!result.success) {
            emergency = EmergencyUiState(
                reason = result.message ?: "Auto landing failed.",
                status = ScreenDataState.ERROR,
                mode = EmergencyMode.INFO,
                nextStep = "Switch to manual takeover and land with the controller.",
                primaryActionEnabled = false,
                secondaryActionEnabled = true,
            )
            activeScreen = ConsoleScreen.EMERGENCY
            return
        }

        val confirmationNeeded = landingConfirmationNeededProvider?.invoke() == true
        val suitabilityWarning = landingSuitabilityWarningProvider?.invoke()
        landingPromptSource = when {
            confirmationNeeded && suitabilityWarning != null -> LandingPromptSource.DJI_CONFIRMATION_WITH_LOCAL_WARNING
            confirmationNeeded -> LandingPromptSource.DJI_CONFIRMATION_REQUIRED
            suitabilityWarning != null -> LandingPromptSource.LOCAL_PERCEPTION_WARNING
            else -> null
        }

        if (landingPromptSource != null) {
            landingConfirmationPromptActive = true
            landingConfirmationPromptReason = suitabilityWarning ?: "DJI requires landing confirmation."
            activeScreen = ConsoleScreen.EMERGENCY
            refreshEmergencyPanel()
            return
        }

        flightState = flightState.copy(
            stage = FlightStage.COMPLETED,
            lastEvent = FlightEventType.USER_LAND_REQUESTED,
            holdReason = null,
        )
        activeScreen = currentMainScreen()
        refreshFlightPanels()
    }

    fun requestTakeover() {
        flightState = flightState.copy(
            stage = FlightStage.MANUAL_OVERRIDE,
            lastEvent = FlightEventType.USER_TAKEOVER_REQUESTED,
            statusNote = "Operator takeover active.",
        )
        landingRcOnlyFallbackReason = "RC takeover active."
        activeScreen = ConsoleScreen.EMERGENCY
        refreshFlightPanels()
    }

    fun runPrimaryEmergencyAction() {
        if (!landingConfirmationPromptActive) {
            return
        }
        when (landingPromptSource) {
            LandingPromptSource.LOCAL_PERCEPTION_WARNING -> {
                runCommand(stopAutoLandingExecutor, fallbackMessage = "Stop auto landing failed.")
                clearLandingFlowState()
                flightState = flightState.copy(stage = FlightStage.HOVER_READY)
                activeScreen = currentMainScreen()
            }

            LandingPromptSource.DJI_CONFIRMATION_REQUIRED,
            LandingPromptSource.DJI_CONFIRMATION_WITH_LOCAL_WARNING -> {
                val confirmResult = runCommand(confirmLandingExecutor, fallbackMessage = "Confirm landing failed.")
                val confirmedAndDescending = confirmResult.success && runBlocking { verifyLandingProgressAfterConfirm() }
                if (!confirmedAndDescending) {
                    enterRcOnlyLandingFallback(confirmResult.message ?: "Landing confirmation did not produce a real descent.")
                } else {
                    clearLandingFlowState()
                    flightState = flightState.copy(stage = FlightStage.COMPLETED)
                    activeScreen = currentMainScreen()
                }
            }

            null -> Unit
        }
        refreshFlightPanels()
    }

    fun runSecondaryEmergencyAction() {
        if (!landingConfirmationPromptActive) {
            return
        }
        enterRcOnlyLandingFallback("RC-only landing fallback was requested by the operator.")
        refreshFlightPanels()
    }

    private suspend fun handlePatrolRouteStart(
        bundle: MissionBundle,
        evaluation: PreflightEvaluation,
    ) {
        if (flightState.missionUploaded) {
            if (flightState.stage != FlightStage.MISSION_READY) {
                preflight = buildPreflightState(evaluation).copy(
                    status = ScreenDataState.ERROR,
                    warning = "Patrol mission is already uploaded. Land and return to Mission Ready, then start the DJI waypoint mission from the ground.",
                )
                return
            }
            val startResult = executeCommand(missionStartExecutor, fallbackMessage = "Mission start failed.")
            if (!startResult.success) {
                preflight = buildPreflightState(evaluation).copy(
                    status = ScreenDataState.ERROR,
                    warning = startResult.message ?: "Mission start failed.",
                )
                return
            }
            flightState = flightState.copy(
                stage = FlightStage.TRANSIT,
                lastEvent = FlightEventType.MISSION_UPLOADED,
                missionContextMode = MissionContextMode.PLANNED_BUNDLE,
            )
            activeScreen = ConsoleScreen.IN_FLIGHT
            refreshFlightPanels()
            return
        }

        if (flightState.stage != FlightStage.MISSION_READY) {
            preflight = buildPreflightState(evaluation).copy(
                status = ScreenDataState.ERROR,
                warning = "Finish preflight first, then upload the patrol mission.",
            )
            return
        }
        val uploadResult = executeCommand(
            executor = missionUploadExecutor?.let { uploader ->
                suspend { uploader.invoke(bundle) }
            },
            fallbackMessage = "Mission upload failed.",
        )
        if (!uploadResult.success) {
            preflight = buildPreflightState(evaluation).copy(
                status = ScreenDataState.ERROR,
                warning = uploadResult.message ?: "Mission upload failed.",
            )
            return
        }
        flightState = flightState.copy(
            stage = FlightStage.MISSION_READY,
            missionUploaded = true,
            lastEvent = FlightEventType.MISSION_UPLOADED,
            missionContextMode = MissionContextMode.PLANNED_BUNDLE,
        )
        refreshPreflightPresentation()
        refreshFlightPanels()
    }

    private fun handleManualPilotEntry(evaluation: PreflightEvaluation) {
        if (!hoverReadyForMissionStart || flightState.stage != FlightStage.HOVER_READY) {
            preflight = buildPreflightState(evaluation).copy(
                status = ScreenDataState.ERROR,
                warning = "Manual Pilot requires a stable hover first.",
            )
            return
        }
        flightState = flightState.copy(
            stage = FlightStage.MANUAL_OVERRIDE,
            lastEvent = FlightEventType.USER_TAKEOVER_REQUESTED,
            statusNote = "Manual Pilot active.",
            missionContextMode = currentMissionContextMode(),
        )
        activeScreen = ConsoleScreen.MANUAL_PILOT
        refreshFlightPanels()
    }

    private fun clearLandingFlowState() {
        landingConfirmationPromptActive = false
        landingPromptSource = null
        landingConfirmationPromptReason = null
        landingRcOnlyFallbackReason = null
    }

    private fun refreshMissionSetupProfile() {
        val bundleVerified = bundleVerified()
        val missionContextMode = currentMissionContextMode()
        val canContinue = canContinueFromMissionSetup()

        missionSetup = missionSetup.copy(
            plannedOperatingProfile = plannedOperatingProfile,
            selectedConsoleMode = selectedConsoleMode,
            selectableConsoleModes = selectableConsoleModes(),
            selectionLocked = activeScreen != ConsoleScreen.MISSION_SETUP,
            status = when {
                missionBundle == null && !selectedConsoleMode.requiresMissionBundle -> ScreenDataState.PARTIAL
                missionBundle == null -> ScreenDataState.EMPTY
                bundleVerified -> ScreenDataState.SUCCESS
                else -> ScreenDataState.ERROR
            },
            profileSummary = when (selectedConsoleMode) {
                OperatorConsoleMode.INDOOR_MANUAL ->
                    "室內手動飛行保留現場操控與保守安全確認，不要求任務包。"

                OperatorConsoleMode.OUTDOOR_PATROL ->
                    "室外巡邏維持任務包、模擬驗證、起飛前檢查與 waypoint patrol 主路徑。"

                OperatorConsoleMode.OUTDOOR_MANUAL_PILOT ->
                    "室外手動飛行可直接進入連線檢查與起飛前檢查，不要求任務包。"
            },
            autonomyStatus = when (selectedConsoleMode.executionMode) {
                ExecutionMode.PATROL_ROUTE -> "Patrol Route 由 mission bundle 與 KMZ / waypoint mission 驅動。"
                ExecutionMode.MANUAL_PILOT -> "Manual Pilot 由 Android 本地操控，不建立 planner authority。"
            },
            nextStep = when {
                selectedConsoleMode.requiresMissionBundle && !bundleVerified ->
                    "請先同步並驗證任務包，再進入連線檢查。"

                missionContextMode == MissionContextMode.UNPLANNED_MANUAL ->
                    "這次會以未綁定任務包的現場手動飛行進入連線檢查與起飛前檢查。"

                false ->
                    "先完成模擬驗證，再進入連線檢查。"

                else -> "前往連線檢查與起飛前檢查。"
            },
            continueLabel = if (runtimeMode == RuntimeMode.PROD) "Go to Connection Guide" else "前往連線檢查",
            canContinue = canContinue,
            missionContextMode = missionContextMode,
            profileMismatchWarning = plannedOperatingProfile
                ?.takeIf { it != selectedConsoleMode.executedOperatingProfile }
                ?.let {
                    "Planned profile 與目前操作模式不同；這次會依照操作員選擇的 console mode 執行。"
                },
        )
        if (runtimeMode == RuntimeMode.PROD && missionSetup.profileMismatchWarning != null) {
            missionSetup = missionSetup.copy(profileMismatchWarning = null)
        }
    }

    private fun refreshConnectionGuidePresentation() {
        connectionGuide = connectionGuide.copy(modeLabel = selectedConsoleMode.displayLabel)
    }

    private fun refreshPreflightPresentation() {
        val evaluation = evaluatePreflight()
        latestPreflightEvaluation = evaluation
        preflight = buildPreflightState(evaluation)
    }

    private fun buildPreflightState(evaluation: PreflightEvaluation): PreflightUiState {
        val blockers = evaluation.blockers.map { it.detail }
        val readyForPatrolStart = selectedConsoleMode.executionMode == ExecutionMode.PATROL_ROUTE &&
            flightState.stage == FlightStage.MISSION_READY &&
            flightState.missionUploaded
        val readyForManualPilot = selectedConsoleMode.executionMode == ExecutionMode.MANUAL_PILOT &&
            hoverReadyForMissionStart &&
            flightState.stage == FlightStage.HOVER_READY
        val patrolMode = selectedConsoleMode.executionMode == ExecutionMode.PATROL_ROUTE

        return PreflightUiState(
            status = when {
                commandInProgress -> ScreenDataState.PARTIAL
                blockers.isNotEmpty() -> ScreenDataState.ERROR
                else -> ScreenDataState.SUCCESS
            },
            blockers = blockers,
            readyToUpload = !commandInProgress && (readyForPatrolStart || readyForManualPilot || (
                patrolMode &&
                    evaluation.canTakeoff &&
                    flightState.stage == FlightStage.MISSION_READY &&
                    !flightState.missionUploaded
                )),
            checklist = evaluation.gates.map(::toChecklistItem),
            warning = when {
                commandInProgress -> "DJI 指令執行中，請等待結果，不要重複點擊。"
                blockers.isNotEmpty() -> null
                selectedConsoleMode.executionMode == ExecutionMode.MANUAL_PILOT && flightState.stage == FlightStage.MISSION_READY ->
                    "先用 App takeoff 或 RC 起飛，進入 stable hover 後才能切到 Manual Pilot。"
                patrolMode && flightState.missionUploaded ->
                    "任務已上傳。請在地面直接啟動 DJI 航點任務，不要先用 App 或 RC 起飛到 hover。"
                else -> null
            },
            modeLabel = selectedConsoleMode.displayLabel,
            operationSummary = selectedConsoleMode.detail,
            nextStep = when {
                blockers.isNotEmpty() -> "Resolve every blocking preflight gate."
                selectedConsoleMode.executionMode == ExecutionMode.MANUAL_PILOT && readyForManualPilot ->
                    "可直接進入 Manual Pilot。"
                selectedConsoleMode.executionMode == ExecutionMode.MANUAL_PILOT ->
                    "先完成起飛並確認 stable hover。"
                readyForPatrolStart ->
                    "啟動 DJI 航點任務，讓 waypoint mission 自行起飛、爬升並前往第 1 航點。"
                flightState.stage == FlightStage.MISSION_READY ->
                    "先上傳 patrol mission，通過後再啟動 DJI 航點任務。"
                else -> "完成 preflight 後再繼續。"
            },
            decisionHint = if (selectedConsoleMode.executionMode == ExecutionMode.MANUAL_PILOT) {
                "任何不確定狀況先進 HOLD，再決定 LAND 或 TAKEOVER。"
            } else {
                "戶外 patrol 一律由 KMZ / waypoint mission 擔任主航段 authority。"
            },
            propOnBlocked = false,
            propOnBlockReason = null,
            uploadActionLabel = when {
                selectedConsoleMode.executionMode == ExecutionMode.MANUAL_PILOT -> "進入手動飛行"
                patrolMode && flightState.missionUploaded -> "啟動航點任務"
                else -> "上傳任務"
            },
            indoorConfirmations = if (selectedConsoleMode == OperatorConsoleMode.INDOOR_MANUAL) {
                indoorConfirmationItems()
            } else {
                emptyList()
            },
            autonomyStatus = when (selectedConsoleMode.executionMode) {
                ExecutionMode.PATROL_ROUTE -> "Patrol Route 僅限戶外執行，並保留 RTH / landing fallback。"
                ExecutionMode.MANUAL_PILOT -> "Manual Pilot 只做 Android 本地 direct control，不進 planner authority。"
            },
            appTakeoffAction = PreflightActionState(
                label = "App 起飛",
                enabled = !commandInProgress && !patrolMode && evaluation.canTakeoff && flightState.stage in setOf(FlightStage.MISSION_READY, FlightStage.TAKEOFF),
                visible = !patrolMode,
            ),
            rcHoverAction = PreflightActionState(
                label = "RC 起飛後確認 hover",
                enabled = !commandInProgress && !patrolMode && evaluation.canTakeoff && flightState.stage in setOf(FlightStage.MISSION_READY, FlightStage.TAKEOFF),
                visible = !patrolMode,
            ),
            landAction = PreflightActionState(
                label = "降落",
                enabled = !commandInProgress && flightState.stage !in setOf(FlightStage.IDLE, FlightStage.PRECHECK, FlightStage.MISSION_READY, FlightStage.COMPLETED, FlightStage.ABORTED),
                visible = selectedConsoleMode.executionMode == ExecutionMode.MANUAL_PILOT,
            ),
        )
    }

    private fun refreshFlightPanels() {
        refreshTransitPanel()
        refreshBranchVerifyPanel()
        refreshInspectionPanel()
        refreshEmergencyPanel()
        maybeReportSync()
    }

    private fun refreshTransitPanel() {
        val progressLabel = when {
            selectedConsoleMode.executionMode == ExecutionMode.MANUAL_PILOT && flightState.stage == FlightStage.MANUAL_OVERRIDE ->
                "Manual Pilot active"
            flightState.stage == FlightStage.HOVER_READY -> "Hover ready"
            flightState.stage == FlightStage.TRANSIT -> "Waypoint patrol in progress"
            flightState.stage == FlightStage.HOLD -> "Holding position"
            flightState.stage == FlightStage.RTH -> "Returning to home"
            flightState.stage == FlightStage.LANDING -> "Landing in progress"
            flightState.stage == FlightStage.COMPLETED -> "Mission complete"
            else -> "Waiting to enter the next flight phase"
        }

        transit = transit.copy(
            stateLabel = stageLabel(flightState.stage),
            status = when (flightState.stage) {
                FlightStage.TRANSIT,
                FlightStage.TAKEOFF,
                FlightStage.HOVER_READY,
                FlightStage.MANUAL_OVERRIDE -> ScreenDataState.SUCCESS
                FlightStage.HOLD,
                FlightStage.RTH,
                FlightStage.LANDING -> ScreenDataState.PARTIAL
                FlightStage.COMPLETED -> ScreenDataState.SUCCESS
                else -> ScreenDataState.EMPTY
            },
            progressLabel = progressLabel,
            telemetry = defaultTelemetry(flightState.stage),
            riskReason = flightState.holdReason,
            nextStep = when {
                selectedConsoleMode.executionMode == ExecutionMode.MANUAL_PILOT && flightState.stage == FlightStage.MANUAL_OVERRIDE ->
                    "Use the dual-stick panel and keep HOLD / LAND / TAKEOVER available."
                flightState.stage == FlightStage.TRANSIT ->
                    "Monitor waypoint progress, upload state, and any landing fallback warning."
                flightState.stage == FlightStage.COMPLETED && flightState.missionContextMode == MissionContextMode.UNPLANNED_MANUAL ->
                    "This unplanned manual flight does not keep blackbox or incident export artifacts."
                flightState.stage == FlightStage.COMPLETED ->
                    "Export blackbox logs and incident artifacts."
                else -> "Continue the current mission flow."
            },
            partialWarning = when {
                !flightState.authValid -> "Operator authentication expired. Protect the local bundle and pending uploads."
                flightState.pendingEventUploads + flightState.pendingTelemetryUploads > 0 ->
                    "Pending uploads: events ${flightState.pendingEventUploads}, telemetry ${flightState.pendingTelemetryUploads}"
                lastTakeoffPath != null -> "Takeoff path: $lastTakeoffPath"
                else -> null
            },
            isCompleted = flightState.stage == FlightStage.COMPLETED,
            isHold = flightState.stage == FlightStage.HOLD,
        )
        maybeReportTelemetry()
    }

    private fun refreshBranchVerifyPanel() {
        branchVerify = branchVerify.copy(
            status = if (activeScreen == ConsoleScreen.BRANCH_CONFIRM) ScreenDataState.PARTIAL else ScreenDataState.EMPTY,
            confidenceLabel = if (activeScreen == ConsoleScreen.BRANCH_CONFIRM) "Debug only" else "Waiting",
        )
    }

    private fun refreshInspectionPanel() {
        inspection = inspection.copy(
            alignmentStatus = if (activeScreen == ConsoleScreen.INSPECTION) "Debug inspection flow" else "Legacy inspection flow hidden in prod",
            captureEnabled = activeScreen == ConsoleScreen.INSPECTION,
        )
    }

    private fun refreshEmergencyPanel() {
        if (landingConfirmationPromptActive) {
            emergency = EmergencyUiState(
                reason = landingConfirmationPromptReason ?: "Landing requires operator attention.",
                status = ScreenDataState.PARTIAL,
                mode = EmergencyMode.INFO,
                nextStep = when (landingPromptSource) {
                    LandingPromptSource.LOCAL_PERCEPTION_WARNING ->
                        "Cancel auto landing and return to hover, or switch to RC-only landing."
                    else ->
                        "Confirm landing if the area is safe, or switch to RC-only landing."
                },
                primaryActionLabel = when (landingPromptSource) {
                    LandingPromptSource.LOCAL_PERCEPTION_WARNING -> "返回 hover"
                    else -> "確認降落"
                },
                secondaryActionLabel = "RC-only 降落",
                operatorHint = "任何不確定都優先保守處理。若 callback 成功但沒有實際下降，一律退到 RC-only fallback。",
                primaryActionEnabled = true,
                secondaryActionEnabled = true,
            )
            return
        }

        emergency = when (flightState.stage) {
            FlightStage.HOLD -> EmergencyUiState(
                reason = flightState.holdReason ?: "Aircraft is holding.",
                status = ScreenDataState.PARTIAL,
                mode = EmergencyMode.HOLD,
                nextStep = "Resume only when the hazard is fully understood.",
                primaryActionLabel = "維持 HOLD",
                secondaryActionLabel = if (supportsReturnToHome) "返航" else "降落",
                primaryActionEnabled = true,
                secondaryActionEnabled = true,
            )

            FlightStage.RTH -> EmergencyUiState(
                reason = "Return-to-home in progress.",
                status = ScreenDataState.PARTIAL,
                mode = EmergencyMode.RTH,
                nextStep = "Monitor descent and be ready for landing fallback.",
                primaryActionLabel = "維持返航",
                secondaryActionEnabled = false,
            )

            FlightStage.MANUAL_OVERRIDE -> EmergencyUiState(
                reason = landingRcOnlyFallbackReason ?: "Manual override active.",
                status = ScreenDataState.PARTIAL,
                mode = EmergencyMode.TAKEOVER,
                nextStep = "Operator is responsible for final recovery and landing.",
                primaryActionEnabled = false,
                secondaryActionLabel = "保持接管",
                secondaryActionEnabled = true,
            )

            FlightStage.COMPLETED -> EmergencyUiState(
                reason = "Flight flow completed.",
                status = ScreenDataState.SUCCESS,
                mode = EmergencyMode.INFO,
                nextStep = if (flightState.missionContextMode == MissionContextMode.UNPLANNED_MANUAL) {
                    "Record operator notes now. This unplanned manual flight does not keep blackbox or mission artifacts."
                } else {
                    "Review blackbox records and export mission artifacts."
                },
                primaryActionEnabled = false,
                secondaryActionEnabled = false,
            )

            else -> EmergencyUiState(
                reason = "No active emergency.",
                status = ScreenDataState.EMPTY,
                mode = EmergencyMode.INFO,
                nextStep = "Continue the current mission flow.",
                primaryActionEnabled = false,
                secondaryActionEnabled = false,
            )
        }
    }

    private fun maybeReportSync() {
        if (scope == null || syncReporter == null) {
            return
        }
        scope.launch {
            val syncStatus = syncReporter.invoke(flightState)
            flightState = flightState.copy(
                authValid = syncStatus.authValid,
                pendingEventUploads = syncStatus.pendingEventUploads,
                pendingTelemetryUploads = syncStatus.pendingTelemetryUploads,
                statusNote = syncStatus.statusNote ?: flightState.statusNote,
            )
            refreshTransitPanel()
        }
    }

    private fun maybeReportTelemetry() {
        if (scope == null || telemetryReporter == null) {
            return
        }
        scope.launch {
            val syncStatus = telemetryReporter.invoke(transit)
            flightState = flightState.copy(
                authValid = syncStatus.authValid,
                pendingEventUploads = syncStatus.pendingEventUploads,
                pendingTelemetryUploads = syncStatus.pendingTelemetryUploads,
                statusNote = syncStatus.statusNote ?: flightState.statusNote,
            )
            refreshTransitPanel()
        }
    }

    private suspend fun verifyLandingProgressAfterConfirm(): Boolean {
        val provider = landingVerificationSnapshotProvider ?: return true
        val initial = provider.invoke()
        repeat(6) {
            delay(300)
            val current = provider.invoke()
            if (!current.isFlying) {
                return true
            }
            val initialHeight = initial.ultrasonicHeightDm
            val currentHeight = current.ultrasonicHeightDm
            if (initialHeight != null && currentHeight != null && currentHeight < initialHeight) {
                return true
            }
        }
        return false
    }

    private fun enterRcOnlyLandingFallback(reason: String) {
        clearLandingFlowState()
        landingRcOnlyFallbackReason = reason
        flightState = flightState.copy(
            stage = FlightStage.MANUAL_OVERRIDE,
            lastEvent = FlightEventType.USER_TAKEOVER_REQUESTED,
            statusNote = reason,
        )
        activeScreen = ConsoleScreen.EMERGENCY
    }

    private fun runCommand(
        executor: (suspend () -> CommandActionResult)?,
        fallbackMessage: String,
    ): CommandActionResult {
        return runCatching { runBlocking { executeCommand(executor, fallbackMessage) } }
            .getOrElse { error ->
                CommandActionResult(
                    success = false,
                    message = error.message ?: fallbackMessage,
                )
            }
    }

    private suspend fun executeCommand(
        executor: (suspend () -> CommandActionResult)?,
        fallbackMessage: String,
    ): CommandActionResult {
        val block = executor ?: return if (runtimeMode == RuntimeMode.DEMO) {
            CommandActionResult(success = true)
        } else {
            CommandActionResult(success = false, message = fallbackMessage)
        }
        return runCatching { block.invoke() }
            .getOrElse { error ->
                CommandActionResult(
                    success = false,
                    message = error.message ?: fallbackMessage,
                )
            }
    }

    private fun runFlightCommand(
        pendingMessage: String,
        block: suspend () -> Unit,
    ) {
        if (commandInProgress) {
            preflight = preflight.copy(
                status = ScreenDataState.PARTIAL,
                warning = "上一個 DJI 指令尚未完成，請等待結果。",
            )
            return
        }
        val coordinatorScope = scope
        if (coordinatorScope == null || runtimeMode == RuntimeMode.DEMO) {
            runCatching { runBlocking { block.invoke() } }
                .onFailure { error ->
                    preflight = preflight.copy(
                        status = ScreenDataState.ERROR,
                        warning = error.message ?: "DJI command failed.",
                    )
                }
            return
        }

        commandInProgress = true
        preflight = preflight.copy(
            status = ScreenDataState.PARTIAL,
            warning = pendingMessage,
            readyToUpload = false,
            appTakeoffAction = preflight.appTakeoffAction.copy(enabled = false),
            rcHoverAction = preflight.rcHoverAction.copy(enabled = false),
            landAction = preflight.landAction.copy(enabled = false),
        )
        coordinatorScope.launch {
            runCatching { block.invoke() }
                .onFailure { error ->
                    preflight = preflight.copy(
                        status = ScreenDataState.ERROR,
                        warning = error.message ?: "DJI command failed.",
                    )
                }
            val preserveError = preflight.status == ScreenDataState.ERROR && !preflight.warning.isNullOrBlank()
            commandInProgress = false
            if (!preserveError) {
                refreshPreflightPresentation()
            }
            refreshFlightPanels()
        }
    }

    private fun bundleVerified(): Boolean = missionBundle?.isVerified() == true

    private fun currentMissionContextMode(): MissionContextMode =
        selectedConsoleMode.resolveMissionContextMode(bundleVerified())

    private fun canContinueFromMissionSetup(): Boolean =
        bundleVerified() || !selectedConsoleMode.requiresMissionBundle

    private fun evaluatePreflight(): PreflightEvaluation =
        preflightEvaluator?.invoke() ?: defaultPreflightEvaluation()

    private fun defaultPreflightEvaluation(): PreflightEvaluation {
        val bundleReady = bundleVerified()
        val bundleBlocking = selectedConsoleMode.requiresMissionBundle
        val gates = mutableListOf(
            PreflightGateResult(
                gateId = PreflightGateId.MISSION_BUNDLE,
                passed = if (bundleBlocking) bundleReady else true,
                blocking = bundleBlocking,
                detail = when {
                    bundleBlocking && bundleReady -> "Mission bundle verified"
                    bundleBlocking -> "Mission bundle missing or unverified"
                    bundleReady -> "Mission bundle optional in manual mode"
                    else -> "No verified mission bundle. This session will run as unplanned manual flight"
                },
            ),
        )
        if (selectedConsoleMode == OperatorConsoleMode.INDOOR_MANUAL) {
            gates += PreflightGateResult(
                gateId = PreflightGateId.INDOOR_PROFILE_CONFIRMATION,
                passed = indoorConfirmationState.complete,
                blocking = true,
                detail = if (indoorConfirmationState.complete) {
                    "Indoor no-GPS confirmations complete"
                } else {
                    "Complete the indoor no-GPS confirmations."
                },
            )
        }
        return PreflightEvaluation(
            canTakeoff = gates.none { !it.passed && it.blocking },
            gates = gates,
            profileBlockingReason = if (selectedConsoleMode == OperatorConsoleMode.INDOOR_MANUAL && !indoorConfirmationState.complete) {
                "Indoor no-GPS mode requires explicit operator confirmations before takeoff."
            } else {
                null
            },
        )
    }

    private fun indoorConfirmationItems(): List<IndoorConfirmationItem> {
        return listOf(
            IndoorConfirmationItem("siteConfirmed", "確認當前場域是室內 / 無 GPS", indoorConfirmationState.siteConfirmed),
            IndoorConfirmationItem("rthUnavailableAcknowledged", "理解室內模式不提供 RTH", indoorConfirmationState.rthUnavailableAcknowledged),
            IndoorConfirmationItem("observerReady", "第二觀察員已到位", indoorConfirmationState.observerReady),
            IndoorConfirmationItem("takeoffZoneClear", "起飛與降落區域已清空", indoorConfirmationState.takeoffZoneClear),
            IndoorConfirmationItem("manualTakeoverReady", "RC 手動接管已準備好", indoorConfirmationState.manualTakeoverReady),
        )
    }

    private fun toChecklistItem(gate: PreflightGateResult): PreflightChecklistItem {
        val label = when (gate.gateId) {
            PreflightGateId.AIRCRAFT_CONNECTED -> "Aircraft"
            PreflightGateId.REMOTE_CONTROLLER_CONNECTED -> "Remote controller"
            PreflightGateId.CAMERA_STREAM -> "Camera stream"
            PreflightGateId.STORAGE -> "Storage"
            PreflightGateId.DEVICE_HEALTH -> "Device health"
            PreflightGateId.FLY_ZONE -> "Fly zone"
            PreflightGateId.GPS -> "GPS"
            PreflightGateId.HOME_POINT -> "DJI Home Point"
            PreflightGateId.MISSION_BUNDLE -> "Mission bundle"
            PreflightGateId.INDOOR_PROFILE_CONFIRMATION -> "Indoor confirmation"
        }
        return PreflightChecklistItem(label = label, passed = gate.passed, detail = gate.detail)
    }

    private fun selectableConsoleModes(): List<OperatorConsoleMode> {
        return if (runtimeMode == RuntimeMode.PROD) {
            OperatorConsoleMode.entries.filter { it.isProdV1Selectable }
        } else {
            OperatorConsoleMode.entries
        }
    }

    private fun stageLabel(stage: FlightStage): String {
        return when (stage) {
            FlightStage.IDLE -> "待命"
            FlightStage.PRECHECK -> "起飛前檢查"
            FlightStage.MISSION_READY -> "任務準備完成"
            FlightStage.TAKEOFF -> "起飛中"
            FlightStage.HOVER_READY -> "Hover Ready"
            FlightStage.TRANSIT -> "主航段"
            FlightStage.BRANCH_VERIFY -> "分支確認"
            FlightStage.LOCAL_AVOID -> "本地避障"
            FlightStage.APPROACH_VIEWPOINT -> "接近巡檢點"
            FlightStage.VIEW_ALIGN -> "視角對位"
            FlightStage.CAPTURE -> "拍攝中"
            FlightStage.HOLD -> "HOLD"
            FlightStage.MANUAL_OVERRIDE -> "手動接管 / Manual Pilot"
            FlightStage.RTH -> "返航"
            FlightStage.LANDING -> "降落中"
            FlightStage.COMPLETED -> "已完成"
            FlightStage.ABORTED -> "已中止"
        }
    }

    private fun defaultTelemetry(stage: FlightStage): List<TelemetryField> {
        return listOf(
            TelemetryField("階段", stageLabel(stage)),
            TelemetryField("控台", selectedConsoleMode.displayLabel),
            TelemetryField("Profile", operationProfile.displayLabel),
            TelemetryField("Execution", selectedConsoleMode.executionMode.displayLabel),
        )
    }

    private fun uploadState(): String {
        return when {
            flightState.missionContextMode == MissionContextMode.UNPLANNED_MANUAL -> "not_applicable"
            flightState.missionUploaded -> "uploaded"
            missionBundle == null -> "bundle_missing"
            missionBundle?.isVerified() == true -> "pending_upload"
            else -> "bundle_unverified"
        }
    }

    private fun currentMainScreen(): ConsoleScreen {
        return if (selectedConsoleMode.executionMode == ExecutionMode.MANUAL_PILOT) {
            ConsoleScreen.MANUAL_PILOT
        } else {
            ConsoleScreen.IN_FLIGHT
        }
    }
}
