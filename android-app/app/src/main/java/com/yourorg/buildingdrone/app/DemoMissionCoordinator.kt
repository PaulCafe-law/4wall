package com.yourorg.buildingdrone.app

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.domain.statemachine.FlightEventType
import com.yourorg.buildingdrone.domain.statemachine.FlightReducer
import com.yourorg.buildingdrone.domain.statemachine.FlightStage
import com.yourorg.buildingdrone.domain.statemachine.FlightState
import com.yourorg.buildingdrone.domain.statemachine.TransitionContext
import com.yourorg.buildingdrone.feature.branchverify.BranchVerifyUiState
import com.yourorg.buildingdrone.feature.emergency.EmergencyMode
import com.yourorg.buildingdrone.feature.emergency.EmergencyUiState
import com.yourorg.buildingdrone.feature.inspection.InspectionCaptureUiState
import com.yourorg.buildingdrone.feature.mission.MissionSetupUiState
import com.yourorg.buildingdrone.feature.preflight.PreflightChecklistItem
import com.yourorg.buildingdrone.feature.preflight.PreflightUiState
import com.yourorg.buildingdrone.feature.transit.TelemetryField
import com.yourorg.buildingdrone.feature.transit.TransitUiState
import com.yourorg.buildingdrone.ui.ScreenDataState

enum class ConsoleScreen(val label: String) {
    MISSION_SETUP("任務設定"),
    PREFLIGHT("飛前檢查"),
    IN_FLIGHT("飛行中"),
    BRANCH_CONFIRM("岔路確認"),
    INSPECTION("巡檢拍攝"),
    EMERGENCY("緊急狀態")
}

class DemoMissionCoordinator(
    private val reducer: FlightReducer
) {
    val currentStageLabel: String
        get() = flightState.stage.toDisplayLabel()

    var missionBundle by mutableStateOf<MissionBundle?>(null)
        private set
    var flightState by mutableStateOf(FlightState())
        private set
    var activeScreen by mutableStateOf(ConsoleScreen.MISSION_SETUP)
        private set

    var missionSetup by mutableStateOf(
        MissionSetupUiState(
            bundleLoaded = false,
            demoMode = true,
            status = ScreenDataState.EMPTY,
            missionLabel = "尚未載入任務",
            artifactStatus = "尚未附加模擬任務包"
        )
    )
        private set

    var preflight by mutableStateOf(
        PreflightUiState(
            blockers = listOf("尚未載入任務"),
            readyToUpload = false,
            checklist = listOf(
                PreflightChecklistItem("飛機連線", false, "等待載入展示任務"),
                PreflightChecklistItem("任務包", false, "尚未載入"),
                PreflightChecklistItem("安全策略", true, "已啟用保守預設")
            ),
            warning = "目前為展示模式"
        )
    )
        private set

    var transit by mutableStateOf(
        TransitUiState(
            stateLabel = "待命",
            emergencyVisible = true,
            status = ScreenDataState.EMPTY,
            telemetry = defaultTelemetry("等待任務")
        )
    )
        private set

    var branchVerify by mutableStateOf(
        BranchVerifyUiState(
            availableOptions = listOf("左轉", "右轉", "直行"),
            status = ScreenDataState.EMPTY
        )
    )
        private set

    var inspection by mutableStateOf(
        InspectionCaptureUiState(
            viewpointLabel = "東北側立面",
            captureStatus = ScreenDataState.EMPTY
        )
    )
        private set

    var emergency by mutableStateOf(
        EmergencyUiState(
            reason = "目前沒有啟用中的保護動作",
            mode = EmergencyMode.INFO,
            nextStep = "先載入任務，再開始展示流程"
        )
    )
        private set

    fun attachBundle(bundle: MissionBundle?) {
        missionBundle = bundle
        missionSetup = missionSetup.copy(
            bundleLoaded = bundle != null,
            status = if (bundle == null) ScreenDataState.EMPTY else ScreenDataState.PARTIAL,
            missionLabel = bundle?.missionId ?: "尚未載入任務",
            artifactStatus = if (bundle == null) {
                "尚未附加模擬任務包"
            } else {
                "已附加任務中繼資料與本地展示任務包"
            },
            summary = bundle?.let {
                listOf(
                    "${it.corridorSegments.size} 個走廊區段",
                    "${it.verificationPoints.size} 個驗證點",
                    "${it.inspectionViewpoints.size} 個巡檢視點",
                    "安全策略：${failsafeActionLabel(it.failsafe.onSemanticTimeout)}/${failsafeActionLabel(it.failsafe.onBatteryCritical)}"
                )
            } ?: emptyList()
        )
    }

    fun selectScreen(screen: ConsoleScreen) {
        activeScreen = screen
    }

    fun openPreflightChecklist() {
        if (missionBundle == null) {
            missionSetup = missionSetup.copy(
                status = ScreenDataState.ERROR,
                warning = "請先載入任務包，再開啟飛前檢查"
            )
            return
        }
        activeScreen = ConsoleScreen.PREFLIGHT
    }

    fun loadMockMission() {
        if (missionBundle == null) {
            missionSetup = missionSetup.copy(
                status = ScreenDataState.ERROR,
                warning = "本地容器中找不到模擬任務包"
            )
            return
        }
        applyEvent(FlightEventType.MISSION_SELECTED)
        applyEvent(FlightEventType.MISSION_BUNDLE_DOWNLOADED, TransitionContext(missionBundleLoaded = true))
        missionSetup = missionSetup.copy(
            bundleLoaded = true,
            status = ScreenDataState.SUCCESS,
            warning = "模擬任務已在本機載入，伺服器不在飛行控制迴圈內。"
        )
        preflight = preflight.copy(
            blockers = listOf("起飛前請先上傳任務"),
            readyToUpload = false,
            checklist = listOf(
                PreflightChecklistItem("飛機連線", true, "已接上展示用飛機"),
                PreflightChecklistItem("任務包", true, "已載入模擬任務"),
                PreflightChecklistItem("安全策略", true, "已啟用懸停 / 返航保守預設")
            ),
            warning = "飛行關鍵迴圈仍留在裝置端"
        )
        activeScreen = ConsoleScreen.PREFLIGHT
    }

    fun approvePreflight() {
        if (!isInStage(FlightStage.PRECHECK)) {
            preflight = preflight.copy(
                blockers = listOf("請先在任務設定頁載入任務"),
                readyToUpload = false,
                warning = "尚未載入任務前，不能通過飛前檢查。"
            )
            activeScreen = ConsoleScreen.PREFLIGHT
            return
        }
        applyEvent(FlightEventType.PREFLIGHT_OK, TransitionContext(missionBundleLoaded = true))
        preflight = preflight.copy(
            blockers = emptyList(),
            readyToUpload = true,
            warning = "可以上傳航點任務"
        )
    }

    fun uploadAndStartMission() {
        if (!isInStage(FlightStage.MISSION_READY) || !preflight.readyToUpload) {
            preflight = preflight.copy(
                blockers = listOf("上傳前請先完成飛前檢查"),
                readyToUpload = false,
                warning = "在檢查表通過前，禁止上傳任務。"
            )
            activeScreen = ConsoleScreen.PREFLIGHT
            return
        }
        applyEvent(
            FlightEventType.MISSION_UPLOADED,
            TransitionContext(
                missionBundleLoaded = true,
                missionUploaded = true,
                takeoffComplete = true
            )
        )
        activeScreen = ConsoleScreen.IN_FLIGHT
    }

    fun replayTelemetry() {
        transit = transit.copy(
            status = ScreenDataState.PARTIAL,
            progressLabel = "展示回放進行中",
            telemetry = listOf(
                TelemetryField("經緯度", "25.03410, 121.56470"),
                TelemetryField("高度", "34.6 m"),
                TelemetryField("速度", "3.8 m/s"),
                TelemetryField("電量", "78%"),
                TelemetryField("偏移", "1.2 m")
            ),
            partialWarning = "目前顯示的是模擬遙測，不是真機狀態",
            nextStep = "可觸發岔路確認或巡檢進場"
        )
        activeScreen = ConsoleScreen.IN_FLIGHT
    }

    fun triggerBranchConfirm() {
        if (!isInStage(FlightStage.TRANSIT, FlightStage.LOCAL_AVOID)) {
            transit = transit.copy(
                status = ScreenDataState.ERROR,
                partialWarning = "只有在飛行中巡航階段才能觸發岔路確認。"
            )
            activeScreen = ConsoleScreen.IN_FLIGHT
            return
        }
        applyEvent(FlightEventType.VERIFICATION_POINT_REACHED, TransitionContext(missionUploaded = true))
        branchVerify = branchVerify.copy(
            status = ScreenDataState.PARTIAL,
            confidenceLabel = "信心值 0.74",
            countdownSeconds = 3,
            reason = "前方道路分岔，請確認允許的前進方向。"
        )
        activeScreen = ConsoleScreen.BRANCH_CONFIRM
    }

    fun confirmBranch(option: String) {
        if (!isInStage(FlightStage.BRANCH_VERIFY)) {
            branchVerify = branchVerify.copy(
                status = ScreenDataState.ERROR,
                reason = "只有在岔路驗證啟動時才能確認方向。"
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
            confidenceLabel = "已確認：${branchOptionLabel(option)}",
            countdownSeconds = 0,
            reason = "已依照確認方向恢復任務"
        )
        activeScreen = ConsoleScreen.IN_FLIGHT
    }

    fun branchTimeout() {
        if (!isInStage(FlightStage.BRANCH_VERIFY)) {
            branchVerify = branchVerify.copy(
                status = ScreenDataState.ERROR,
                reason = "只有在岔路驗證期間才能觸發逾時。"
            )
            activeScreen = ConsoleScreen.BRANCH_CONFIRM
            return
        }
        applyEvent(FlightEventType.BRANCH_VERIFY_TIMEOUT, TransitionContext(missionUploaded = true))
        branchVerify = branchVerify.copy(
            status = ScreenDataState.ERROR,
            confidenceLabel = "已逾時",
            countdownSeconds = 0,
            reason = "語意判定逾時，飛機已懸停。"
        )
        activeScreen = ConsoleScreen.EMERGENCY
    }

    fun triggerObstacleWarn() {
        if (!isInStage(FlightStage.TRANSIT, FlightStage.LOCAL_AVOID)) {
            transit = transit.copy(
                status = ScreenDataState.ERROR,
                partialWarning = "只有在走廊巡航期間才能觸發障礙警示。"
            )
            activeScreen = ConsoleScreen.IN_FLIGHT
            return
        }
        applyEvent(FlightEventType.OBSTACLE_WARN, TransitionContext(missionUploaded = true))
        transit = transit.copy(
            status = ScreenDataState.PARTIAL,
            riskReason = "附近有障礙物。本地避障只允許減速或小幅偏移。",
            nextStep = "清除障礙，或升級為懸停",
            partialWarning = "目前啟用受限自主模式"
        )
    }

    fun triggerObstacleHardStop() {
        if (!isInStage(FlightStage.TRANSIT, FlightStage.LOCAL_AVOID, FlightStage.BRANCH_VERIFY)) {
            transit = transit.copy(
                status = ScreenDataState.ERROR,
                partialWarning = "只有在進行中的飛行階段才能觸發硬停。"
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
                partialWarning = "目前沒有待清除的障礙事件。"
            )
            activeScreen = ConsoleScreen.IN_FLIGHT
            return
        }
        applyEvent(FlightEventType.OBSTACLE_WARN, TransitionContext(missionUploaded = true, obstacleCleared = true))
        transit = transit.copy(
            status = ScreenDataState.SUCCESS,
            riskReason = null,
            partialWarning = null,
            nextStep = "繼續任務"
        )
        activeScreen = ConsoleScreen.IN_FLIGHT
    }

    fun triggerInspectionApproach() {
        if (!isInStage(FlightStage.TRANSIT, FlightStage.LOCAL_AVOID)) {
            transit = transit.copy(
                status = ScreenDataState.ERROR,
                partialWarning = "只有在巡航階段才能進入巡檢進場。"
            )
            activeScreen = ConsoleScreen.IN_FLIGHT
            return
        }
        applyEvent(FlightEventType.INSPECTION_ZONE_REACHED, TransitionContext(missionUploaded = true))
        inspection = inspection.copy(
            captureStatus = ScreenDataState.PARTIAL,
            alignmentStatus = "正在接近視點",
            framingHints = listOf("將立面邊緣置中", "保持 12 公尺觀測距離", "偏航 225 度"),
            reason = "僅允許低速進場",
            captureEnabled = false
        )
        activeScreen = ConsoleScreen.INSPECTION
    }

    fun alignView() {
        if (!isInStage(FlightStage.APPROACH_VIEWPOINT, FlightStage.VIEW_ALIGN)) {
            inspection = inspection.copy(
                captureStatus = ScreenDataState.ERROR,
                reason = "請先進入巡檢進場階段，再進行對位。",
                captureEnabled = false
            )
            activeScreen = ConsoleScreen.INSPECTION
            return
        }
        applyEvent(FlightEventType.VIEW_ALIGN_OK, TransitionContext(missionUploaded = true))
        inspection = inspection.copy(
            captureStatus = ScreenDataState.PARTIAL,
            alignmentStatus = "畫面已對齊，可以拍攝",
            reason = "已達成穩定懸停",
            captureEnabled = flightState.stage == FlightStage.VIEW_ALIGN
        )
    }

    fun captureView() {
        if (flightState.stage != FlightStage.VIEW_ALIGN) {
            inspection = inspection.copy(
                captureStatus = ScreenDataState.PARTIAL,
                reason = "拍攝前請先完成視角對位",
                captureEnabled = false
            )
            return
        }
        val stateAfterCapture = if (flightState.stage == FlightStage.VIEW_ALIGN) {
            reducer.reduce(flightState, FlightEventType.VIEW_ALIGN_OK, TransitionContext(missionUploaded = true))
        } else {
            flightState
        }
        flightState = stateAfterCapture
        flightState = reducer.reduce(
            stateAfterCapture,
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
            reason = "飛機已切換為懸停",
            captureEnabled = false
        )
        syncFromFlightState()
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

    private fun applyEvent(event: FlightEventType, context: TransitionContext = TransitionContext()) {
        flightState = reducer.reduce(flightState, event, context)
        syncFromFlightState()
    }

    private fun syncFromFlightState() {
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
                FlightStage.TRANSIT -> "任務走廊巡航中"
                FlightStage.BRANCH_VERIFY -> "等待岔路確認"
                FlightStage.LOCAL_AVOID -> "本地避障中"
                FlightStage.APPROACH_VIEWPOINT -> "正在接近巡檢視點"
                FlightStage.VIEW_ALIGN -> "正在對齊視角"
                FlightStage.CAPTURE -> "拍攝流程進行中"
                FlightStage.HOLD -> "飛機已懸停"
                FlightStage.RTH -> "正在返航"
                FlightStage.LANDING -> "正在降落"
                FlightStage.COMPLETED -> "任務完成"
                FlightStage.MANUAL_OVERRIDE -> "操作員已接管"
                FlightStage.ABORTED -> "任務已中止"
                else -> "任務已就緒"
            },
            telemetry = defaultTelemetry(flightState.stage.toDisplayLabel()),
            riskReason = flightState.holdReason,
            nextStep = when (flightState.stage) {
                FlightStage.IDLE -> "載入任務包"
                FlightStage.PRECHECK -> "完成飛前檢查"
                FlightStage.MISSION_READY -> "上傳任務"
                FlightStage.TRANSIT -> "監看走廊狀態與事件觸發"
                FlightStage.HOLD -> "選擇返航或人工接管"
                FlightStage.RTH -> "等待降落完成"
                FlightStage.MANUAL_OVERRIDE -> "由飛手手動操控"
                FlightStage.COMPLETED -> "重設下一輪展示"
                FlightStage.ABORTED -> "必要時重新載入任務"
                else -> "繼續流程"
            }
        )

        emergency = when (flightState.stage) {
            FlightStage.HOLD -> EmergencyUiState(
                reason = flightState.holdReason ?: "飛機已懸停",
                mode = EmergencyMode.HOLD,
                nextStep = "系統刻意不提供自動恢復，請選擇返航或人工接管。",
                primaryActionLabel = "目前不可降落",
                secondaryActionLabel = "中止手動模式",
                completeLandingEnabled = false,
                abortManualEnabled = false
            )

            FlightStage.RTH -> EmergencyUiState(
                reason = "返航進行中",
                mode = EmergencyMode.RTH,
                nextStep = "飛機回到返航點後，請標記為已抵達。",
                primaryActionLabel = "標記已返航",
                secondaryActionLabel = "中止手動模式",
                completeLandingEnabled = true,
                abortManualEnabled = false
            )

            FlightStage.MANUAL_OVERRIDE -> EmergencyUiState(
                reason = "人工接管啟用中",
                mode = EmergencyMode.TAKEOVER,
                nextStep = "目前由飛手接管，可手動結束或中止任務。",
                primaryActionLabel = "目前不可降落",
                secondaryActionLabel = "中止手動模式",
                completeLandingEnabled = false,
                abortManualEnabled = true
            )

            FlightStage.LANDING -> EmergencyUiState(
                reason = "降落進行中",
                mode = EmergencyMode.RTH,
                nextStep = "請保持降落區淨空，確認後完成降落。",
                primaryActionLabel = "完成降落",
                secondaryActionLabel = "中止手動模式",
                completeLandingEnabled = true,
                abortManualEnabled = false
            )

            FlightStage.COMPLETED -> EmergencyUiState(
                reason = "任務已安全完成",
                mode = EmergencyMode.INFO,
                nextStep = "如需再次展示，請重新載入任務。",
                primaryActionLabel = "降落已完成",
                secondaryActionLabel = "中止手動模式",
                completeLandingEnabled = false,
                abortManualEnabled = false
            )

            FlightStage.ABORTED -> EmergencyUiState(
                reason = "任務已中止",
                mode = EmergencyMode.TAKEOVER,
                nextStep = "再次執行前，請先檢查中止原因。",
                primaryActionLabel = "目前不可降落",
                secondaryActionLabel = "手動模式已中止",
                completeLandingEnabled = false,
                abortManualEnabled = false
            )

            else -> EmergencyUiState(
                reason = "目前沒有啟用中的保護動作",
                mode = EmergencyMode.INFO,
                nextStep = "請隨時注意底部的懸停 / 返航 / 接管控制列。",
                primaryActionLabel = "目前不可降落",
                secondaryActionLabel = "中止手動模式",
                completeLandingEnabled = false,
                abortManualEnabled = false
            )
        }
    }

    companion object {
        private fun defaultTelemetry(stage: String): List<TelemetryField> = listOf(
            TelemetryField("階段", stage),
            TelemetryField("高度", "35.0 m"),
            TelemetryField("速度", "0.0-4.0 m/s"),
            TelemetryField("電量", "78%"),
            TelemetryField("策略", "不確定先懸停")
        )
    }

    private fun isInStage(vararg expected: FlightStage): Boolean = flightState.stage in expected

    private fun failsafeActionLabel(value: String): String = when (value) {
        "HOLD" -> "懸停"
        "RTH" -> "返航"
        else -> value
    }

    private fun branchOptionLabel(option: String): String = when (option) {
        "LEFT" -> "左轉"
        "RIGHT" -> "右轉"
        "STRAIGHT" -> "直行"
        else -> option
    }

    private fun FlightStage.toDisplayLabel(): String = when (this) {
        FlightStage.IDLE -> "待命"
        FlightStage.PRECHECK -> "飛前檢查"
        FlightStage.MISSION_READY -> "任務就緒"
        FlightStage.TAKEOFF -> "起飛"
        FlightStage.TRANSIT -> "巡航"
        FlightStage.BRANCH_VERIFY -> "岔路驗證"
        FlightStage.LOCAL_AVOID -> "本地避障"
        FlightStage.APPROACH_VIEWPOINT -> "巡檢進場"
        FlightStage.VIEW_ALIGN -> "視角對位"
        FlightStage.CAPTURE -> "拍攝"
        FlightStage.HOLD -> "懸停"
        FlightStage.MANUAL_OVERRIDE -> "人工接管"
        FlightStage.RTH -> "返航"
        FlightStage.LANDING -> "降落"
        FlightStage.COMPLETED -> "完成"
        FlightStage.ABORTED -> "中止"
    }
}
