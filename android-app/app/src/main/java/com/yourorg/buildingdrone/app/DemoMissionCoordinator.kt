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
    PREFLIGHT("Preflight"),
    IN_FLIGHT("飛行中"),
    BRANCH_CONFIRM("分支確認"),
    INSPECTION("檢視點拍攝"),
    EMERGENCY("緊急處置")
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
            blockers = listOf("尚未建立 preflight 狀態"),
            readyToUpload = false,
            checklist = emptyList(),
            warning = "先載入 mission bundle，再檢查飛安 gate。",
            modeLabel = runtimeMode.name.lowercase()
        )
    )
        private set

    var transit by mutableStateOf(
        TransitUiState(
            stateLabel = "待命",
            emergencyVisible = true,
            status = ScreenDataState.EMPTY,
            telemetry = defaultTelemetry("尚未起飛")
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
            viewpointLabel = "等待進入 inspection viewpoint"
        )
    )
        private set

    var emergency by mutableStateOf(
        EmergencyUiState(
            reason = "目前沒有 blocking emergency。",
            mode = EmergencyMode.INFO,
            nextStep = "載入任務後開始 preflight。"
        )
    )
        private set

    private var latestPreflightEvaluation: PreflightEvaluation? = null

    fun attachBundle(bundle: MissionBundle?, statusMessage: String? = null, authStatus: String? = missionSetup.authStatus) {
        missionBundle = bundle
        missionSetup = missionSetup.copy(
            bundleLoaded = bundle != null,
            status = when {
                bundle == null -> ScreenDataState.EMPTY
                bundle.isVerified() -> ScreenDataState.SUCCESS
                else -> ScreenDataState.PARTIAL
            },
            missionLabel = bundle?.missionId ?: "尚未下載任務",
            artifactStatus = when {
                bundle == null -> "mission.kmz / mission_meta.json 尚未可用"
                bundle.isVerified() -> "mission.kmz / mission_meta.json 已驗證"
                else -> "mission bundle 未通過驗證"
            },
            summary = bundle?.let {
                listOf(
                    "走廊段數：${it.corridorSegments.size}",
                    "分支驗證點：${it.verificationPoints.size}",
                    "Inspection viewpoints：${it.inspectionViewpoints.size}",
                    "預設高度 / 速度：${it.defaultAltitudeMeters}m / ${it.defaultSpeedMetersPerSecond}mps",
                    "Failsafe：${it.failsafe.onSemanticTimeout} / ${it.failsafe.onBatteryCritical}"
                )
            } ?: emptyList(),
            warning = statusMessage,
            authStatus = authStatus,
            loadActionLabel = if (runtimeMode == RuntimeMode.DEMO) "載入 Demo 任務" else "登入並下載任務"
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
                warning = "尚未載入 mission bundle，無法進入 preflight。"
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
                    warning = "Mission loader 尚未綁定 coroutine scope。"
                )
                return
            }
            missionSetup = missionSetup.copy(
                status = ScreenDataState.LOADING,
                warning = "正在向 planner-server 下載 mission bundle…"
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
                warning = "目前沒有可載入的本地任務。"
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
                "Mission bundle 已驗證，可進入 preflight。"
            } else {
                "Mission bundle 驗證失敗，禁止起飛。"
            }
        )
        if (missionBundle?.isVerified() == true) {
            openPreflightChecklist()
        }
    }

    fun approvePreflight() {
        if (!isInStage(FlightStage.PRECHECK)) {
            preflight = preflight.copy(
                blockers = listOf("Flight stage 不是 PRECHECK"),
                readyToUpload = false,
                warning = "只有在 PRECHECK 階段才能核准 preflight。"
            )
            activeScreen = ConsoleScreen.PREFLIGHT
            return
        }

        val evaluation = latestPreflightEvaluation
        if (evaluation != null && !evaluation.canTakeoff) {
            applyPreflightEvaluation(evaluation)
            preflight = preflight.copy(
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
            blockers = emptyList(),
            readyToUpload = true,
            warning = "Preflight 通過，可以上傳 mission 到 aircraft。"
        )
    }

    fun uploadAndStartMission() {
        if (!isInStage(FlightStage.MISSION_READY) || !preflight.readyToUpload) {
            preflight = preflight.copy(
                blockers = listOf("尚未完成 preflight 或 mission bundle 驗證"),
                readyToUpload = false,
                warning = "目前不允許上傳 mission。"
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
            progressLabel = "重播遙測中",
            telemetry = listOf(
                TelemetryField("位置", "25.03410, 121.56470"),
                TelemetryField("高度", "34.6 m"),
                TelemetryField("速度", "3.8 m/s"),
                TelemetryField("電量", "78%"),
                TelemetryField("走廊偏移", "1.2 m")
            ),
            partialWarning = "此資料為本地重播，用於檢查 upload backlog 與 UI 判讀。",
            nextStep = "確認 telemetry backlog 狀態，再回到飛行主畫面。"
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
            confidenceLabel = "模型信心：0.74",
            countdownSeconds = 3,
            reason = "模型需要操作員確認道路分支方向。"
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
            confidenceLabel = "操作員已確認：$option",
            countdownSeconds = 0,
            reason = "分支確認完成，恢復主航段。"
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
            confidenceLabel = "已逾時",
            countdownSeconds = 0,
            reason = "Branch confirm timeout，系統已進入 HOLD。"
        )
        activeScreen = ConsoleScreen.EMERGENCY
    }

    fun triggerObstacleWarn() {
        if (!isInStage(FlightStage.TRANSIT, FlightStage.LOCAL_AVOID)) {
            transit = transit.copy(
                status = ScreenDataState.ERROR,
                partialWarning = "目前 stage 不允許觸發 obstacle warning。"
            )
            activeScreen = ConsoleScreen.IN_FLIGHT
            return
        }
        applyEvent(FlightEventType.OBSTACLE_WARN, TransitionContext(missionUploaded = true))
        transit = transit.copy(
            status = ScreenDataState.PARTIAL,
            riskReason = "Local avoider 建議先減速，必要時 HOLD。",
            nextStep = "確認障礙是否解除，或直接切換 HOLD / RTH / TAKEOVER。",
            partialWarning = "此階段只允許低速短時本地微調，不允許以 virtual stick 取代主航段。"
        )
    }

    fun triggerObstacleHardStop() {
        if (!isInStage(FlightStage.TRANSIT, FlightStage.LOCAL_AVOID, FlightStage.BRANCH_VERIFY)) {
            transit = transit.copy(
                status = ScreenDataState.ERROR,
                partialWarning = "目前 stage 不允許觸發 hard stop。"
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
                partialWarning = "目前不在 LOCAL_AVOID，無法標記 obstacle cleared。"
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
            nextStep = "障礙已解除，恢復主航段。"
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
            alignmentStatus = "已接近 viewpoint，等待對齊",
            framingHints = listOf("建築外牆置中", "距離外牆約 12m", "Yaw 約 225 度"),
            reason = "進入 inspection approach。",
            captureEnabled = false
        )
        activeScreen = ConsoleScreen.INSPECTION
    }

    fun alignView() {
        if (!isInStage(FlightStage.APPROACH_VIEWPOINT, FlightStage.VIEW_ALIGN)) {
            inspection = inspection.copy(
                captureStatus = ScreenDataState.ERROR,
                reason = "目前不在可對齊畫面階段。",
                captureEnabled = false
            )
            activeScreen = ConsoleScreen.INSPECTION
            return
        }
        applyEvent(FlightEventType.VIEW_ALIGN_OK, TransitionContext(missionUploaded = true))
        inspection = inspection.copy(
            captureStatus = ScreenDataState.PARTIAL,
            alignmentStatus = "視角已對齊，可以拍攝",
            reason = "允許開始 capture。",
            captureEnabled = flightState.stage == FlightStage.VIEW_ALIGN
        )
    }

    fun captureView() {
        if (flightState.stage != FlightStage.VIEW_ALIGN) {
            inspection = inspection.copy(
                captureStatus = ScreenDataState.PARTIAL,
                reason = "必須先完成 Align View 才能 Capture。",
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
            alignmentStatus = "拍攝完成",
            reason = "等待操作員決定 Resume / RTH / Takeover。",
            captureEnabled = false
        )
        syncFromFlightState()
        publishFlightState()
        activeScreen = ConsoleScreen.EMERGENCY
    }

    fun requestHold() {
        applyEvent(FlightEventType.USER_HOLD_REQUESTED, TransitionContext(missionUploaded = flightState.missionUploaded))
        activeScreen = ConsoleScreen.EMERGENCY
    }

    fun requestRth() {
        applyEvent(FlightEventType.USER_RTH_REQUESTED, TransitionContext(missionUploaded = flightState.missionUploaded))
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
        applyEvent(FlightEventType.USER_TAKEOVER_REQUESTED, TransitionContext(missionUploaded = flightState.missionUploaded))
        activeScreen = ConsoleScreen.EMERGENCY
    }

    fun abortManual() {
        if (flightState.stage != FlightStage.MANUAL_OVERRIDE) {
            return
        }
        applyEvent(FlightEventType.USER_TAKEOVER_REQUESTED, TransitionContext(manualOverrideAborted = true))
        activeScreen = ConsoleScreen.EMERGENCY
    }

    private fun presentDemoPreflight() {
        latestPreflightEvaluation = null
        preflight = preflight.copy(
            blockers = listOf("等待操作員核准"),
            readyToUpload = false,
            checklist = listOf(
                UiPreflightChecklistItem("Aircraft / RC 連線", true, "Demo mode 預設已通過"),
                UiPreflightChecklistItem("Mission bundle 驗證", missionBundle?.isVerified() == true, "已使用本地 verified bundle"),
                UiPreflightChecklistItem("Device storage", true, "Demo mode 儲存空間充足")
            ),
            warning = "Demo mode 仍需操作員手動核准 preflight。",
            modeLabel = "demo"
        )
    }

    private fun applyPreflightEvaluation(evaluation: PreflightEvaluation) {
        latestPreflightEvaluation = evaluation
        preflight = preflight.copy(
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
                "所有 gate 通過，可以核准 preflight。"
            } else {
                "仍有 blocking gate，禁止 TAKEOFF。"
            },
            modeLabel = runtimeMode.name.lowercase()
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
        val backlogText = when {
            flightState.pendingEventUploads + flightState.pendingTelemetryUploads == 0 -> null
            else -> "待補送 uploads：events ${flightState.pendingEventUploads} / telemetry ${flightState.pendingTelemetryUploads}"
        }
        val uploadNote = flightState.statusNote

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
                else -> ScreenDataState.SUCCESS
            },
            isCompleted = flightState.stage == FlightStage.COMPLETED,
            progressLabel = when (flightState.stage) {
                FlightStage.IDLE -> "等待任務"
                FlightStage.TRANSIT -> "沿道路走廊前進中"
                FlightStage.BRANCH_VERIFY -> "等待 branch confirm"
                FlightStage.LOCAL_AVOID -> "執行低速本地避讓"
                FlightStage.APPROACH_VIEWPOINT -> "接近 inspection viewpoint"
                FlightStage.VIEW_ALIGN -> "等待視角對齊"
                FlightStage.CAPTURE -> "執行拍攝"
                FlightStage.HOLD -> "已進入 HOLD"
                FlightStage.RTH -> "執行 Return-To-Home"
                FlightStage.LANDING -> "降落中"
                FlightStage.COMPLETED -> "任務完成"
                FlightStage.MANUAL_OVERRIDE -> "人工接管中"
                FlightStage.ABORTED -> "任務中止"
                else -> "任務進行中"
            },
            telemetry = defaultTelemetry(flightState.stage.toDisplayLabel()),
            riskReason = flightState.holdReason,
            nextStep = when (flightState.stage) {
                FlightStage.IDLE -> "先載入 mission bundle。"
                FlightStage.PRECHECK -> "檢查 preflight gates。"
                FlightStage.MISSION_READY -> "上傳 mission 並準備起飛。"
                FlightStage.TRANSIT -> "監看 branch confirm、obstacle 與 failsafe。"
                FlightStage.HOLD -> "只允許 Resume / RTH / Takeover。"
                FlightStage.RTH -> "確認航機返航與降落狀態。"
                FlightStage.MANUAL_OVERRIDE -> "操作員負責安全接管。"
                FlightStage.COMPLETED -> "匯出 logs 並檢查 backlog。"
                FlightStage.ABORTED -> "確認現場安全後結束任務。"
                else -> "持續監看飛行狀態。"
            },
            partialWarning = backlogText ?: uploadNote
        )

        missionSetup = missionSetup.copy(
            authStatus = missionSetup.authStatus ?: if (runtimeMode == RuntimeMode.DEMO) "Demo mode 不需要登入" else null,
            warning = when {
                missionBundle == null -> missionSetup.warning
                backlogText != null -> backlogText
                else -> missionSetup.warning
            }
        )

        emergency = when (flightState.stage) {
            FlightStage.HOLD -> EmergencyUiState(
                reason = flightState.holdReason ?: "系統已進入 HOLD。",
                mode = EmergencyMode.HOLD,
                nextStep = "確認停住原因後，只能選 Resume / RTH / Takeover。",
                primaryActionLabel = "完成降落",
                secondaryActionLabel = "中止任務",
                completeLandingEnabled = false,
                abortManualEnabled = false
            )

            FlightStage.RTH -> EmergencyUiState(
                reason = "已觸發 Return-To-Home。",
                mode = EmergencyMode.RTH,
                nextStep = "持續監看返航路徑與降落條件。",
                primaryActionLabel = "確認已到達降落",
                secondaryActionLabel = "中止任務",
                completeLandingEnabled = true,
                abortManualEnabled = false
            )

            FlightStage.MANUAL_OVERRIDE -> EmergencyUiState(
                reason = "操作員已接管控制。",
                mode = EmergencyMode.TAKEOVER,
                nextStep = "以人工方式處理當前風險，再決定是否中止任務。",
                primaryActionLabel = "完成降落",
                secondaryActionLabel = "中止任務",
                completeLandingEnabled = false,
                abortManualEnabled = true
            )

            FlightStage.LANDING -> EmergencyUiState(
                reason = "降落中。",
                mode = EmergencyMode.RTH,
                nextStep = "確認航機已安全落地。",
                primaryActionLabel = "確認已落地",
                secondaryActionLabel = "中止任務",
                completeLandingEnabled = true,
                abortManualEnabled = false
            )

            FlightStage.COMPLETED -> EmergencyUiState(
                reason = "任務已完成。",
                mode = EmergencyMode.INFO,
                nextStep = "檢查 upload backlog 與黑盒日誌。",
                primaryActionLabel = "完成降落",
                secondaryActionLabel = "中止任務",
                completeLandingEnabled = false,
                abortManualEnabled = false
            )

            FlightStage.ABORTED -> EmergencyUiState(
                reason = "任務已中止。",
                mode = EmergencyMode.TAKEOVER,
                nextStep = "確認現場安全，保留 incident logs。",
                primaryActionLabel = "完成降落",
                secondaryActionLabel = "任務已中止",
                completeLandingEnabled = false,
                abortManualEnabled = false
            )

            else -> EmergencyUiState(
                reason = "目前沒有 blocking emergency。",
                mode = EmergencyMode.INFO,
                nextStep = "保持單手可操作，必要時立即使用 HOLD / RTH / TAKEOVER。",
                primaryActionLabel = "完成降落",
                secondaryActionLabel = "中止任務",
                completeLandingEnabled = false,
                abortManualEnabled = false
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
        PreflightGateId.MISSION_BUNDLE -> "Mission bundle 完整性"
    }

    private fun isInStage(vararg expected: FlightStage): Boolean = flightState.stage in expected

    private companion object {
        fun defaultTelemetry(stage: String): List<TelemetryField> = listOf(
            TelemetryField("階段", stage),
            TelemetryField("高度", "35.0 m"),
            TelemetryField("速度", "0.0-4.0 m/s"),
            TelemetryField("電量", "78%"),
            TelemetryField("資料來源", "本地安全迴圈")
        )
    }
}
