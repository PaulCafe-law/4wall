package com.yourorg.buildingdrone.app

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.domain.safety.PreflightEvaluation
import com.yourorg.buildingdrone.domain.safety.PreflightGateId
import com.yourorg.buildingdrone.domain.statemachine.FlightEventType
import com.yourorg.buildingdrone.domain.statemachine.FlightReducer
import com.yourorg.buildingdrone.domain.statemachine.FlightStage
import com.yourorg.buildingdrone.domain.statemachine.FlightState
import com.yourorg.buildingdrone.domain.statemachine.TransitionContext
import com.yourorg.buildingdrone.domain.statemachine.toDisplayLabel
import com.yourorg.buildingdrone.feature.branchverify.BranchVerifyUiState
import com.yourorg.buildingdrone.feature.emergency.EmergencyMode
import com.yourorg.buildingdrone.feature.emergency.EmergencyUiState
import com.yourorg.buildingdrone.feature.inspection.InspectionCaptureUiState
import com.yourorg.buildingdrone.feature.mission.MissionSetupUiState
import com.yourorg.buildingdrone.feature.preflight.PreflightChecklistItem as UiPreflightChecklistItem
import com.yourorg.buildingdrone.feature.preflight.PreflightUiState
import com.yourorg.buildingdrone.feature.transit.TelemetryField
import com.yourorg.buildingdrone.feature.transit.TransitUiState
import com.yourorg.buildingdrone.ui.ScreenDataState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

enum class ConsoleScreen(val label: String) {
    MISSION_SETUP("任務設定"),
    PREFLIGHT("起飛前檢查"),
    IN_FLIGHT("主航段"),
    BRANCH_CONFIRM("分岔確認"),
    INSPECTION("巡檢取像"),
    EMERGENCY("安全決策")
}

sealed interface MissionLoadActionResult {
    data class Success(
        val bundle: MissionBundle,
        val statusMessage: String,
        val authStatus: String? = null
    ) : MissionLoadActionResult

    data class Failure(
        val message: String
    ) : MissionLoadActionResult
}

data class NetworkSyncStatus(
    val authValid: Boolean = true,
    val pendingEventUploads: Int = 0,
    val pendingTelemetryUploads: Int = 0,
    val statusNote: String? = null
)

class DemoMissionCoordinator(
    private val reducer: FlightReducer,
    private val runtimeMode: RuntimeMode = RuntimeMode.DEMO,
    private val scope: CoroutineScope? = null,
    private val missionLoader: (suspend () -> MissionLoadActionResult)? = null,
    private val preflightEvaluator: (() -> PreflightEvaluation)? = null,
    private val syncReporter: (suspend (FlightState) -> NetworkSyncStatus)? = null,
    private val telemetryReporter: (suspend (TransitUiState) -> NetworkSyncStatus)? = null
) {
    val currentStageLabel: String
        get() = flightState.stage.toDisplayLabel()

    var missionBundle by mutableStateOf<MissionBundle?>(null)
        private set
    var flightState by mutableStateOf(FlightState(demoMode = runtimeMode == RuntimeMode.DEMO))
        private set
    var activeScreen by mutableStateOf(ConsoleScreen.MISSION_SETUP)
        private set

    var missionSetup by mutableStateOf(
        MissionSetupUiState(
            bundleLoaded = false,
            demoMode = runtimeMode == RuntimeMode.DEMO
        )
    )
        private set

    var preflight by mutableStateOf(
        PreflightUiState(
            status = ScreenDataState.EMPTY,
            blockers = listOf("先載入並驗證 mission bundle"),
            readyToUpload = false,
            warning = "未完成 bundle 驗證前，不可進入 TAKEOFF gate。",
            modeLabel = runtimeMode.name.lowercase(),
            nextStep = "先取得完整 mission bundle，再檢查起飛 gate"
        )
    )
        private set

    var transit by mutableStateOf(
        TransitUiState(
            stateLabel = "待命",
            emergencyVisible = true,
            status = ScreenDataState.EMPTY,
            telemetry = defaultTelemetry("待命", isHold = false)
        )
    )
        private set

    var branchVerify by mutableStateOf(
        BranchVerifyUiState(
            availableOptions = listOf("LEFT", "RIGHT", "STRAIGHT")
        )
    )
        private set

    var inspection by mutableStateOf(
        InspectionCaptureUiState(
            viewpointLabel = "尚未接近 inspection viewpoint"
        )
    )
        private set

    var emergency by mutableStateOf(
        EmergencyUiState(
            reason = "目前沒有 blocking emergency",
            status = ScreenDataState.EMPTY,
            mode = EmergencyMode.INFO,
            nextStep = "先載入任務包並完成 preflight。"
        )
    )
        private set

    private var latestPreflightEvaluation: PreflightEvaluation? = null

    fun attachBundle(
        bundle: MissionBundle?,
        statusMessage: String? = null,
        authStatus: String? = missionSetup.authStatus
    ) {
        missionBundle = bundle
        missionSetup = missionSetup.copy(
            bundleLoaded = bundle != null,
            status = when {
                bundle == null -> ScreenDataState.EMPTY
                bundle.isVerified() -> ScreenDataState.SUCCESS
                else -> ScreenDataState.ERROR
            },
            missionLabel = bundle?.missionId ?: "尚未載入任務包",
            artifactStatus = when {
                bundle == null -> "mission.kmz / mission_meta.json 尚未就緒"
                bundle.isVerified() -> "mission.kmz / mission_meta.json 已驗證"
                else -> "mission bundle 驗證失敗"
            },
            summary = bundle?.let {
                listOf(
                    "走廊段數: ${it.corridorSegments.size}",
                    "Verification points: ${it.verificationPoints.size}",
                    "Inspection viewpoints: ${it.inspectionViewpoints.size}",
                    "建議高度 / 速度: ${it.defaultAltitudeMeters}m / ${it.defaultSpeedMetersPerSecond}mps",
                    "Failsafe: semantic ${it.failsafe.onSemanticTimeout} / battery ${it.failsafe.onBatteryCritical}"
                )
            } ?: emptyList(),
            warning = statusMessage,
            authStatus = authStatus,
            loadActionLabel = if (runtimeMode == RuntimeMode.DEMO) "載入 Demo 任務" else "登入後同步任務",
            nextStep = when {
                bundle == null -> "先下載並驗證完整 mission bundle"
                bundle.isVerified() -> "進入 Preflight Checklist，確認起飛 gate"
                else -> "修正 artifact 驗證問題，否則不可起飛"
            }
        )
    }

    fun updateAuthStatus(message: String?) {
        missionSetup = missionSetup.copy(authStatus = message)
    }

    fun selectScreen(screen: ConsoleScreen) {
        activeScreen = screen
    }

    fun openPreflightChecklist() {
        if (missionBundle == null) {
            missionSetup = missionSetup.copy(
                status = ScreenDataState.ERROR,
                warning = "尚未取得 mission bundle，不能進入 preflight。"
            )
            return
        }
        activeScreen = ConsoleScreen.PREFLIGHT
        if (runtimeMode == RuntimeMode.DEMO) {
            presentDemoPreflight()
            return
        }
        val evaluation = preflightEvaluator?.invoke()
        if (evaluation != null) {
            applyPreflightEvaluation(evaluation)
        }
    }

    fun loadMockMission() {
        if (missionLoader != null) {
            val launchScope = scope
            if (launchScope == null) {
                missionSetup = missionSetup.copy(
                    status = ScreenDataState.ERROR,
                    warning = "Mission loader 缺少 coroutine scope。"
                )
                return
            }
            missionSetup = missionSetup.copy(
                status = ScreenDataState.LOADING,
                warning = "正在向 planner-server 同步 mission bundle..."
            )
            launchScope.launch {
                when (val result = missionLoader.invoke()) {
                    is MissionLoadActionResult.Success -> {
                        attachBundle(result.bundle, result.statusMessage, result.authStatus)
                        loadPreparedMission()
                    }

                    is MissionLoadActionResult.Failure -> {
                        missionSetup = missionSetup.copy(
                            status = ScreenDataState.ERROR,
                            warning = result.message
                        )
                    }
                }
            }
            return
        }

        if (missionBundle == null) {
            missionSetup = missionSetup.copy(
                status = ScreenDataState.ERROR,
                warning = "目前沒有可載入的 demo mission。"
            )
            return
        }
        loadPreparedMission()
    }

    private fun loadPreparedMission() {
        applyEvent(FlightEventType.MISSION_SELECTED)
        applyEvent(FlightEventType.MISSION_BUNDLE_DOWNLOADED, TransitionContext(missionBundleLoaded = true))
        applyEvent(
            FlightEventType.MISSION_BUNDLE_VERIFIED,
            TransitionContext(
                missionBundleLoaded = true,
                missionBundleVerified = missionBundle?.isVerified() == true
            )
        )
        missionSetup = missionSetup.copy(
            bundleLoaded = missionBundle != null,
            status = if (missionBundle?.isVerified() == true) ScreenDataState.SUCCESS else ScreenDataState.ERROR,
            warning = if (missionBundle?.isVerified() == true) {
                "Mission bundle 已驗證，接下來請確認 preflight gate。"
            } else {
                "Mission bundle 驗證失敗，禁止起飛。"
            },
            nextStep = if (missionBundle?.isVerified() == true) {
                "前往 Preflight Checklist"
            } else {
                "修正 artifact 驗證問題"
            }
        )
        if (missionBundle?.isVerified() == true) {
            openPreflightChecklist()
        }
    }

    fun approvePreflight() {
        if (!isInStage(FlightStage.PRECHECK)) {
            preflight = preflight.copy(
                status = ScreenDataState.ERROR,
                blockers = listOf("Flight stage 目前不在 PRECHECK"),
                readyToUpload = false,
                warning = "只有在 PRECHECK 才能批准 preflight。"
            )
            activeScreen = ConsoleScreen.PREFLIGHT
            return
        }

        val evaluation = latestPreflightEvaluation
        if (evaluation != null && !evaluation.canTakeoff) {
            applyPreflightEvaluation(evaluation)
            preflight = preflight.copy(
                status = ScreenDataState.ERROR,
                warning = "仍有 blocking gate，禁止 TAKEOFF。"
            )
            return
        }

        applyEvent(
            FlightEventType.PREFLIGHT_OK,
            TransitionContext(
                missionBundleLoaded = true,
                missionBundleVerified = missionBundle?.isVerified() == true,
                preflightReady = true
            )
        )
        preflight = preflight.copy(
            status = ScreenDataState.SUCCESS,
            blockers = emptyList(),
            readyToUpload = true,
            warning = "Preflight 已通過，可上傳任務。",
            nextStep = "確認 mission upload 成功後起飛"
        )
    }

    fun uploadAndStartMission() {
        if (!isInStage(FlightStage.MISSION_READY) || !preflight.readyToUpload) {
            preflight = preflight.copy(
                status = ScreenDataState.ERROR,
                blockers = listOf("Preflight 未完成或 mission bundle 尚未驗證"),
                readyToUpload = false,
                warning = "目前不允許上傳任務。"
            )
            activeScreen = ConsoleScreen.PREFLIGHT
            return
        }
        applyEvent(
            FlightEventType.MISSION_UPLOADED,
            TransitionContext(
                missionBundleLoaded = true,
                missionBundleVerified = missionBundle?.isVerified() == true,
                missionUploaded = true,
                takeoffComplete = true
            )
        )
        activeScreen = ConsoleScreen.IN_FLIGHT
    }

    fun replayTelemetry() {
        transit = transit.copy(
            status = ScreenDataState.PARTIAL,
            progressLabel = "回放主航段 telemetry",
            telemetry = listOf(
                TelemetryField("位置", "25.03410, 121.56470"),
                TelemetryField("高度", "34.6 m"),
                TelemetryField("速度", "3.8 m/s"),
                TelemetryField("電量", "78%"),
                TelemetryField("走廊偏離", "1.2 m")
            ),
            partialWarning = "此畫面會同時顯示本地 upload backlog，不阻塞飛行。",
            nextStep = "確認主航段與 backlog 狀態"
        )
        publishTelemetry()
        activeScreen = ConsoleScreen.IN_FLIGHT
    }

    fun triggerBranchConfirm() {
        if (!isInStage(FlightStage.TRANSIT, FlightStage.LOCAL_AVOID)) {
            transit = transit.copy(
                status = ScreenDataState.ERROR,
                partialWarning = "目前 stage 不允許進入 branch confirm。"
            )
            activeScreen = ConsoleScreen.IN_FLIGHT
            return
        }
        applyEvent(FlightEventType.VERIFICATION_POINT_REACHED, TransitionContext(missionUploaded = true))
        branchVerify = branchVerify.copy(
            status = ScreenDataState.PARTIAL,
            confidenceLabel = "模型信心 0.74",
            countdownSeconds = 3,
            reason = "模型無法穩定分辨左岔或直行，需要人工覆核。",
            nextStep = "由操作員確認左 / 直行 / 右；逾時則進入 HOLD"
        )
        activeScreen = ConsoleScreen.BRANCH_CONFIRM
    }

    fun confirmBranch(option: String) {
        if (!isInStage(FlightStage.BRANCH_VERIFY)) {
            branchVerify = branchVerify.copy(
                status = ScreenDataState.ERROR,
                reason = "目前不在 branch verify 階段。"
            )
            activeScreen = ConsoleScreen.BRANCH_CONFIRM
            return
        }
        val event = when (option) {
            "LEFT" -> FlightEventType.BRANCH_VERIFY_LEFT
            "RIGHT" -> FlightEventType.BRANCH_VERIFY_RIGHT
            else -> FlightEventType.BRANCH_VERIFY_STRAIGHT
        }
        applyEvent(event, TransitionContext(missionUploaded = true))
        branchVerify = branchVerify.copy(
            status = ScreenDataState.SUCCESS,
            confidenceLabel = "已人工確認: $option",
            countdownSeconds = 0,
            reason = "分岔方向已鎖定，恢復主航段。",
            nextStep = "持續監看主航段、障礙與 backlog"
        )
        activeScreen = ConsoleScreen.IN_FLIGHT
    }

    fun branchTimeout() {
        if (!isInStage(FlightStage.BRANCH_VERIFY)) {
            branchVerify = branchVerify.copy(
                status = ScreenDataState.ERROR,
                reason = "目前不在 branch verify 階段。"
            )
            activeScreen = ConsoleScreen.BRANCH_CONFIRM
            return
        }
        applyEvent(FlightEventType.BRANCH_VERIFY_TIMEOUT, TransitionContext(missionUploaded = true))
        branchVerify = branchVerify.copy(
            status = ScreenDataState.ERROR,
            confidenceLabel = "Branch confirm 逾時",
            countdownSeconds = 0,
            reason = "模型與人工都未能在時間內確認方向。"
        )
        activeScreen = ConsoleScreen.EMERGENCY
    }

    fun triggerObstacleWarn() {
        if (!isInStage(FlightStage.TRANSIT, FlightStage.LOCAL_AVOID)) {
            transit = transit.copy(
                status = ScreenDataState.ERROR,
                partialWarning = "目前 stage 不允許進入 obstacle warning。"
            )
            activeScreen = ConsoleScreen.IN_FLIGHT
            return
        }
        applyEvent(FlightEventType.OBSTACLE_WARN, TransitionContext(missionUploaded = true))
        transit = transit.copy(
            status = ScreenDataState.PARTIAL,
            riskReason = "Local avoider 已啟動，只允許低速短時本地微調。",
            nextStep = "確認障礙是否解除；若仍不確定，改用 HOLD / RTH / TAKEOVER。",
            partialWarning = "virtual stick 只允許局部修正，不會改成連續 corridor following。"
        )
    }

    fun triggerObstacleHardStop() {
        if (!isInStage(FlightStage.TRANSIT, FlightStage.LOCAL_AVOID, FlightStage.BRANCH_VERIFY)) {
            transit = transit.copy(
                status = ScreenDataState.ERROR,
                partialWarning = "目前 stage 不允許觸發 obstacle hard stop。"
            )
            activeScreen = ConsoleScreen.IN_FLIGHT
            return
        }
        applyEvent(FlightEventType.OBSTACLE_HARD_STOP, TransitionContext(missionUploaded = true))
        activeScreen = ConsoleScreen.EMERGENCY
    }

    fun clearObstacle() {
        if (!isInStage(FlightStage.LOCAL_AVOID)) {
            transit = transit.copy(
                status = ScreenDataState.ERROR,
                partialWarning = "只有在 LOCAL_AVOID 才能解除障礙。"
            )
            activeScreen = ConsoleScreen.IN_FLIGHT
            return
        }
        applyEvent(
            FlightEventType.OBSTACLE_WARN,
            TransitionContext(missionUploaded = true, obstacleCleared = true)
        )
        transit = transit.copy(
            status = ScreenDataState.SUCCESS,
            riskReason = null,
            partialWarning = null,
            nextStep = "障礙已解除，恢復主航段監看。"
        )
        activeScreen = ConsoleScreen.IN_FLIGHT
    }

    fun triggerInspectionApproach() {
        if (!isInStage(FlightStage.TRANSIT, FlightStage.LOCAL_AVOID)) {
            transit = transit.copy(
                status = ScreenDataState.ERROR,
                partialWarning = "目前 stage 不允許進入 inspection approach。"
            )
            activeScreen = ConsoleScreen.IN_FLIGHT
            return
        }
        applyEvent(FlightEventType.INSPECTION_ZONE_REACHED, TransitionContext(missionUploaded = true))
        inspection = inspection.copy(
            captureStatus = ScreenDataState.PARTIAL,
            viewpointLabel = "north-east-facade",
            alignmentStatus = "已接近 viewpoint，待完成最後對正。",
            framingHints = listOf("保持建物立面完整入鏡", "距離外牆約 12m", "Yaw 約 225 度"),
            reason = "目前進入 inspection approach。",
            captureEnabled = false,
            nextStep = "先按 Align View，再執行 Capture"
        )
        activeScreen = ConsoleScreen.INSPECTION
    }

    fun alignView() {
        if (!isInStage(FlightStage.APPROACH_VIEWPOINT, FlightStage.VIEW_ALIGN)) {
            inspection = inspection.copy(
                captureStatus = ScreenDataState.ERROR,
                reason = "目前不在可對正的階段。",
                captureEnabled = false
            )
            activeScreen = ConsoleScreen.INSPECTION
            return
        }
        applyEvent(FlightEventType.VIEW_ALIGN_OK, TransitionContext(missionUploaded = true))
        inspection = inspection.copy(
            captureStatus = ScreenDataState.PARTIAL,
            alignmentStatus = "畫面已對正，可執行 Capture。",
            reason = "只允許低速短時本地微調，不會改用 virtual stick 連續導引。",
            captureEnabled = flightState.stage == FlightStage.VIEW_ALIGN,
            nextStep = "確認 framing hints 後按 Capture"
        )
    }

    fun captureView() {
        if (flightState.stage != FlightStage.VIEW_ALIGN) {
            inspection = inspection.copy(
                captureStatus = ScreenDataState.PARTIAL,
                reason = "必須先完成 Align View，才能 Capture。",
                captureEnabled = false
            )
            return
        }
        val captureStage = reducer.reduce(
            flightState,
            FlightEventType.VIEW_ALIGN_OK,
            TransitionContext(missionUploaded = true)
        )
        flightState = reducer.reduce(
            captureStage,
            FlightEventType.VIEW_ALIGN_OK,
            TransitionContext(
                missionUploaded = true,
                captureComplete = true,
                hasRemainingViewpoints = false
            )
        )
        inspection = inspection.copy(
            captureStatus = ScreenDataState.SUCCESS,
            alignmentStatus = "Capture 完成",
            reason = "已完成本次 viewpoint 取像。",
            captureEnabled = false,
            nextStep = "現在只允許 Resume / RTH / Takeover 三個決策"
        )
        syncFromFlightState()
        publishFlightState()
        activeScreen = ConsoleScreen.EMERGENCY
    }

    fun requestHold() {
        applyEvent(
            FlightEventType.USER_HOLD_REQUESTED,
            TransitionContext(missionUploaded = flightState.missionUploaded)
        )
        activeScreen = ConsoleScreen.EMERGENCY
    }

    fun requestResume() {
        if (flightState.stage != FlightStage.HOLD) {
            return
        }
        applyEvent(
            FlightEventType.USER_RESUME_REQUESTED,
            TransitionContext(missionUploaded = flightState.missionUploaded)
        )
        activeScreen = when (flightState.stage) {
            FlightStage.BRANCH_VERIFY -> ConsoleScreen.BRANCH_CONFIRM
            FlightStage.APPROACH_VIEWPOINT,
            FlightStage.VIEW_ALIGN,
            FlightStage.CAPTURE -> ConsoleScreen.INSPECTION
            else -> ConsoleScreen.IN_FLIGHT
        }
    }

    fun requestRth() {
        applyEvent(
            FlightEventType.USER_RTH_REQUESTED,
            TransitionContext(missionUploaded = flightState.missionUploaded)
        )
        activeScreen = ConsoleScreen.EMERGENCY
    }

    fun completeRthLanding() {
        when (flightState.stage) {
            FlightStage.RTH -> applyEvent(FlightEventType.USER_RTH_REQUESTED, TransitionContext(rthArrived = true))
            FlightStage.LANDING -> applyEvent(FlightEventType.USER_RTH_REQUESTED, TransitionContext(landingComplete = true))
            else -> return
        }
        activeScreen = ConsoleScreen.EMERGENCY
    }

    fun requestTakeover() {
        applyEvent(
            FlightEventType.USER_TAKEOVER_REQUESTED,
            TransitionContext(missionUploaded = flightState.missionUploaded)
        )
        activeScreen = ConsoleScreen.EMERGENCY
    }

    fun abortManual() {
        if (flightState.stage != FlightStage.MANUAL_OVERRIDE) {
            return
        }
        applyEvent(
            FlightEventType.USER_TAKEOVER_REQUESTED,
            TransitionContext(manualOverrideAborted = true)
        )
        activeScreen = ConsoleScreen.EMERGENCY
    }

    fun runPrimaryEmergencyAction() {
        when (flightState.stage) {
            FlightStage.HOLD -> requestResume()
            FlightStage.RTH,
            FlightStage.LANDING -> completeRthLanding()
            else -> Unit
        }
    }

    fun runSecondaryEmergencyAction() {
        if (flightState.stage == FlightStage.MANUAL_OVERRIDE) {
            abortManual()
        }
    }

    private fun presentDemoPreflight() {
        latestPreflightEvaluation = null
        preflight = preflight.copy(
            status = ScreenDataState.PARTIAL,
            blockers = listOf("需要操作員手動批准 preflight"),
            readyToUpload = false,
            checklist = listOf(
                UiPreflightChecklistItem("Aircraft / RC 連線", true, "Demo mode 預設視為可用"),
                UiPreflightChecklistItem("Mission bundle 驗證", missionBundle?.isVerified() == true, "只有 verified bundle 才能起飛"),
                UiPreflightChecklistItem("Device storage", true, "Demo mode 不做真實容量檢查")
            ),
            warning = "Demo mode 仍要求人工批准，避免把 preflight gate 當成自動通過。",
            modeLabel = "demo",
            nextStep = "確認所有 gate 後，按下「確認 Preflight」"
        )
    }

    private fun applyPreflightEvaluation(evaluation: PreflightEvaluation) {
        latestPreflightEvaluation = evaluation
        preflight = preflight.copy(
            status = if (evaluation.canTakeoff) ScreenDataState.SUCCESS else ScreenDataState.ERROR,
            blockers = evaluation.blockers.map { it.detail },
            readyToUpload = evaluation.canTakeoff,
            checklist = evaluation.gates.map { gate ->
                UiPreflightChecklistItem(
                    label = gateLabel(gate.gateId),
                    passed = gate.passed,
                    detail = gate.detail
                )
            },
            warning = if (evaluation.canTakeoff) {
                "所有 gate 已通過，可上傳任務。"
            } else {
                "仍有 blocking gate，禁止 TAKEOFF。"
            },
            modeLabel = runtimeMode.name.lowercase(),
            nextStep = if (evaluation.canTakeoff) {
                "確認 aircraft 已接收 mission 後起飛"
            } else {
                "先排除所有 blocking gate"
            }
        )
    }

    private fun applyEvent(event: FlightEventType, context: TransitionContext = TransitionContext()) {
        flightState = reducer.reduce(flightState, event, context)
        syncFromFlightState()
        publishFlightState()
    }

    private fun publishFlightState() {
        val reporter = syncReporter ?: return
        val launchScope = scope ?: return
        val snapshot = flightState
        if (snapshot.lastEvent in setOf(
                FlightEventType.AUTH_EXPIRED,
                FlightEventType.AUTH_REFRESHED,
                FlightEventType.UPLOAD_BACKLOG_UPDATED
            )
        ) {
            return
        }
        launchScope.launch {
            applyNetworkSyncStatus(reporter.invoke(snapshot))
        }
    }

    private fun publishTelemetry() {
        val reporter = telemetryReporter ?: return
        val launchScope = scope ?: return
        val transitSnapshot = transit
        launchScope.launch {
            applyNetworkSyncStatus(reporter.invoke(transitSnapshot))
        }
    }

    private fun applyNetworkSyncStatus(status: NetworkSyncStatus) {
        val authEvent = if (status.authValid) FlightEventType.AUTH_REFRESHED else FlightEventType.AUTH_EXPIRED
        flightState = reducer.reduce(
            flightState,
            authEvent,
            TransitionContext(
                authValid = status.authValid,
                pendingEventUploads = status.pendingEventUploads,
                pendingTelemetryUploads = status.pendingTelemetryUploads
            )
        )
        flightState = reducer.reduce(
            flightState,
            FlightEventType.UPLOAD_BACKLOG_UPDATED,
            TransitionContext(
                authValid = status.authValid,
                pendingEventUploads = status.pendingEventUploads,
                pendingTelemetryUploads = status.pendingTelemetryUploads
            )
        ).copy(statusNote = status.statusNote ?: flightState.statusNote)
        syncFromFlightState()
    }

    private fun syncFromFlightState() {
        val backlogMessage = when {
            flightState.pendingEventUploads + flightState.pendingTelemetryUploads == 0 -> null
            else -> "待補送 uploads: events ${flightState.pendingEventUploads} / telemetry ${flightState.pendingTelemetryUploads}"
        }
        val uploadNote = flightState.statusNote
        val partialWarning = listOfNotNull(backlogMessage, uploadNote).distinct().joinToString(" ").ifBlank { null }

        transit = transit.copy(
            stateLabel = flightState.stage.toDisplayLabel(),
            emergencyVisible = true,
            status = when (flightState.stage) {
                FlightStage.IDLE -> ScreenDataState.EMPTY
                FlightStage.HOLD,
                FlightStage.MANUAL_OVERRIDE,
                FlightStage.RTH,
                FlightStage.LANDING -> ScreenDataState.PARTIAL
                FlightStage.COMPLETED -> ScreenDataState.SUCCESS
                FlightStage.ABORTED -> ScreenDataState.ERROR
                else -> ScreenDataState.SUCCESS
            },
            isCompleted = flightState.stage == FlightStage.COMPLETED,
            isHold = flightState.stage == FlightStage.HOLD,
            progressLabel = when (flightState.stage) {
                FlightStage.IDLE -> "等待任務"
                FlightStage.TRANSIT -> "沿道路 / 人行動線飛往建物外側"
                FlightStage.BRANCH_VERIFY -> "等待 branch confirm"
                FlightStage.LOCAL_AVOID -> "進行局部避障"
                FlightStage.APPROACH_VIEWPOINT -> "接近 inspection viewpoint"
                FlightStage.VIEW_ALIGN -> "對正 inspection 畫面"
                FlightStage.CAPTURE -> "執行取像"
                FlightStage.HOLD -> "已停住等待操作員決策"
                FlightStage.RTH -> "返航中"
                FlightStage.LANDING -> "降落中"
                FlightStage.COMPLETED -> "任務已完成"
                FlightStage.MANUAL_OVERRIDE -> "人工接管中"
                FlightStage.ABORTED -> "任務已中止"
                else -> "等待下一步"
            },
            telemetry = defaultTelemetry(
                stage = flightState.stage.toDisplayLabel(),
                isHold = flightState.stage == FlightStage.HOLD
            ),
            riskReason = flightState.holdReason,
            nextStep = when (flightState.stage) {
                FlightStage.IDLE -> "先取得 mission bundle"
                FlightStage.PRECHECK -> "完成 preflight gate"
                FlightStage.MISSION_READY -> "上傳 mission，準備起飛"
                FlightStage.TRANSIT -> "持續監看 branch confirm、障礙與 backlog"
                FlightStage.HOLD -> "只允許 Resume / RTH / Takeover"
                FlightStage.RTH -> "確認返航抵達後進入降落"
                FlightStage.LANDING -> "確認 aircraft 已安全落地"
                FlightStage.MANUAL_OVERRIDE -> "改由人工完成或中止任務"
                FlightStage.COMPLETED -> "檢查 upload backlog 與黑盒匯出"
                FlightStage.ABORTED -> "保留 incident log 並停止任務"
                else -> "維持目前安全態勢"
            },
            partialWarning = partialWarning
        )

        missionSetup = missionSetup.copy(
            authStatus = when {
                runtimeMode == RuntimeMode.DEMO -> "Demo mode 不需要 operator token"
                !flightState.authValid -> "operator token 已過期"
                missionSetup.authStatus != null -> missionSetup.authStatus
                else -> "尚未登入 operator account"
            }
        )

        emergency = when (flightState.stage) {
            FlightStage.HOLD -> EmergencyUiState(
                reason = flightState.holdReason ?: "安全條件不足，已先停住等待",
                status = ScreenDataState.PARTIAL,
                mode = EmergencyMode.HOLD,
                nextStep = "若已確認安全可按 Resume，否則改用 RTH 或 Takeover。",
                primaryActionLabel = "Resume 自主流程",
                secondaryActionLabel = "人工接管改用底部 TAKEOVER",
                primaryActionEnabled = true,
                secondaryActionEnabled = false
            )

            FlightStage.RTH -> EmergencyUiState(
                reason = "已進入 Return-To-Home。",
                status = ScreenDataState.PARTIAL,
                mode = EmergencyMode.RTH,
                nextStep = "確認 aircraft 抵達返航點後，進入降落。",
                primaryActionLabel = "確認已返航",
                secondaryActionLabel = "等待自動降落",
                primaryActionEnabled = true,
                secondaryActionEnabled = false
            )

            FlightStage.LANDING -> EmergencyUiState(
                reason = "降落程序進行中。",
                status = ScreenDataState.PARTIAL,
                mode = EmergencyMode.RTH,
                nextStep = "確認 aircraft 已安全落地。",
                primaryActionLabel = "確認已降落",
                secondaryActionLabel = "等待落地完成",
                primaryActionEnabled = true,
                secondaryActionEnabled = false
            )

            FlightStage.MANUAL_OVERRIDE -> EmergencyUiState(
                reason = "已切換人工接管。",
                status = ScreenDataState.PARTIAL,
                mode = EmergencyMode.TAKEOVER,
                nextStep = "改由人工飛行處理現況，必要時中止任務。",
                primaryActionLabel = "人工控制中",
                secondaryActionLabel = "中止任務",
                primaryActionEnabled = false,
                secondaryActionEnabled = true
            )

            FlightStage.COMPLETED -> EmergencyUiState(
                reason = "任務已完成。",
                status = ScreenDataState.SUCCESS,
                mode = EmergencyMode.INFO,
                nextStep = "檢查 backlog、incident export 與 flight log。",
                primaryActionLabel = "等待下一航次",
                secondaryActionLabel = "無次要動作",
                primaryActionEnabled = false,
                secondaryActionEnabled = false
            )

            FlightStage.ABORTED -> EmergencyUiState(
                reason = flightState.holdReason ?: "任務已中止。",
                status = ScreenDataState.ERROR,
                mode = EmergencyMode.TAKEOVER,
                nextStep = "保留黑盒紀錄，停止後續自主流程。",
                primaryActionLabel = "任務已中止",
                secondaryActionLabel = "無次要動作",
                primaryActionEnabled = false,
                secondaryActionEnabled = false
            )

            else -> EmergencyUiState(
                reason = "目前沒有 blocking emergency",
                status = ScreenDataState.EMPTY,
                mode = EmergencyMode.INFO,
                nextStep = "持續監看主航段，必要時使用底部大按鈕。",
                primaryActionLabel = "無可用主動作",
                secondaryActionLabel = "無次要動作",
                primaryActionEnabled = false,
                secondaryActionEnabled = false
            )
        }
    }

    private fun gateLabel(gateId: PreflightGateId): String = when (gateId) {
        PreflightGateId.AIRCRAFT_CONNECTED -> "Aircraft 連線"
        PreflightGateId.REMOTE_CONTROLLER_CONNECTED -> "RC 連線"
        PreflightGateId.CAMERA_STREAM -> "Camera stream"
        PreflightGateId.STORAGE -> "裝置儲存空間"
        PreflightGateId.DEVICE_HEALTH -> "Device health"
        PreflightGateId.FLY_ZONE -> "Fly zone / 飛安"
        PreflightGateId.GPS -> "GPS / 定位"
        PreflightGateId.MISSION_BUNDLE -> "Mission bundle 驗證"
    }

    private fun isInStage(vararg expected: FlightStage): Boolean = flightState.stage in expected

    private companion object {
        fun defaultTelemetry(stage: String, isHold: Boolean): List<TelemetryField> = listOf(
            TelemetryField("階段", stage),
            TelemetryField("高度", "35.0 m"),
            TelemetryField("速度", if (isHold) "0.0 m/s" else "0.0-4.0 m/s"),
            TelemetryField("電量", "78%"),
            TelemetryField("飛安摘要", "任何不確定都先 HOLD")
        )
    }
}
