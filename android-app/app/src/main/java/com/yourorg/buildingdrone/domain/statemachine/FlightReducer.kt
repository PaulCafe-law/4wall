package com.yourorg.buildingdrone.domain.statemachine

import com.yourorg.buildingdrone.domain.safety.SafetyDecision
import com.yourorg.buildingdrone.domain.safety.SafetySnapshot
import com.yourorg.buildingdrone.domain.safety.SafetySupervisor

class FlightReducer(
    private val transitionGuard: TransitionGuard,
    private val safetySupervisor: SafetySupervisor
) {
    fun reduce(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext = TransitionContext()
    ): FlightState {
        if (event == FlightEventType.AUTH_EXPIRED) {
            return state.copy(
                authValid = false,
                pendingEventUploads = context.pendingEventUploads ?: state.pendingEventUploads,
                pendingTelemetryUploads = context.pendingTelemetryUploads ?: state.pendingTelemetryUploads,
                lastEvent = event,
                statusNote = "伺服器驗證已過期，新的 server 依賴操作會被阻擋。"
            )
        }

        if (event == FlightEventType.AUTH_REFRESHED) {
            return state.copy(
                authValid = true,
                pendingEventUploads = context.pendingEventUploads ?: state.pendingEventUploads,
                pendingTelemetryUploads = context.pendingTelemetryUploads ?: state.pendingTelemetryUploads,
                lastEvent = event,
                statusNote = "伺服器驗證已更新。"
            )
        }

        if (event == FlightEventType.UPLOAD_BACKLOG_UPDATED) {
            val pendingEvents = context.pendingEventUploads ?: state.pendingEventUploads
            val pendingTelemetry = context.pendingTelemetryUploads ?: state.pendingTelemetryUploads
            return state.copy(
                authValid = context.authValid ?: state.authValid,
                pendingEventUploads = pendingEvents,
                pendingTelemetryUploads = pendingTelemetry,
                lastEvent = event,
                statusNote = when {
                    pendingEvents + pendingTelemetry == 0 -> "飛行上傳 backlog 已清空。"
                    else -> "上傳已先記錄在本機，稍後會自動重試。"
                }
            )
        }

        val safetyDecision = safetySupervisor.evaluate(
            event = event,
            snapshot = SafetySnapshot(
                batteryCritical = context.batteryCritical,
                frameStreamHealthy = context.frameStreamHealthy,
                appHealthy = context.appHealthy,
                gpsHealthy = context.gpsReady,
                gpsWeak = context.gpsWeak,
                rcSignalHealthy = context.rcSignalHealthy,
                deviceHealthBlocking = context.deviceHealthBlocking
            )
        )

        if (event == FlightEventType.USER_TAKEOVER_REQUESTED && state.stage != FlightStage.MANUAL_OVERRIDE) {
            return state.toStage(
                target = FlightStage.MANUAL_OVERRIDE,
                event = event,
                context = context,
                reason = "已要求人工接管"
            )
        }

        if ((event == FlightEventType.USER_RTH_REQUESTED || safetyDecision == SafetyDecision.RTH) &&
            state.stage != FlightStage.RTH &&
            state.stage != FlightStage.LANDING
        ) {
            return state.toStage(
                target = FlightStage.RTH,
                event = event,
                context = context,
                reason = "已要求返航"
            ).advanceTransientStages(event, context)
        }

        if ((event == FlightEventType.USER_HOLD_REQUESTED || safetyDecision == SafetyDecision.HOLD) &&
            state.stage != FlightStage.HOLD
        ) {
            return state.toStage(
                target = FlightStage.HOLD,
                event = event,
                context = context,
                reason = state.holdReasonFor(event, context)
            )
        }

        val candidate = when (state.stage) {
            FlightStage.IDLE -> reduceFromIdle(state, event, context)
            FlightStage.PRECHECK -> reduceFromPrecheck(state, event, context)
            FlightStage.MISSION_READY -> reduceFromMissionReady(state, event, context)
            FlightStage.TAKEOFF -> reduceFromTakeoff(state, event, context)
            FlightStage.TRANSIT -> reduceFromTransit(state, event, context)
            FlightStage.BRANCH_VERIFY -> reduceFromBranchVerify(state, event, context)
            FlightStage.LOCAL_AVOID -> reduceFromLocalAvoid(state, event, context)
            FlightStage.APPROACH_VIEWPOINT -> reduceFromApproach(state, event, context)
            FlightStage.VIEW_ALIGN -> reduceFromViewAlign(state, event, context)
            FlightStage.CAPTURE -> reduceFromCapture(state, event, context)
            FlightStage.HOLD -> reduceFromHold(state, event, context)
            FlightStage.MANUAL_OVERRIDE -> reduceFromManualOverride(state, event, context)
            FlightStage.RTH -> reduceFromRth(state, event, context)
            FlightStage.LANDING -> reduceFromLanding(state, event, context)
            FlightStage.COMPLETED,
            FlightStage.ABORTED -> state.copy(lastEvent = event)
        }

        return candidate.advanceTransientStages(event, context)
    }

    private fun reduceFromIdle(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when (event) {
        FlightEventType.MISSION_SELECTED -> state.toStage(
            target = FlightStage.PRECHECK,
            event = event,
            context = context,
            note = "已選擇任務"
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromPrecheck(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when (event) {
        FlightEventType.MISSION_BUNDLE_DOWNLOADED -> state.copy(
            missionBundleLoaded = true,
            lastEvent = event,
            statusNote = "Mission bundle 已下載"
        )

        FlightEventType.MISSION_BUNDLE_VERIFIED -> state.copy(
            missionBundleLoaded = true,
            missionBundleVerified = true,
            lastEvent = event,
            statusNote = "Mission bundle 已驗證"
        )

        FlightEventType.MISSION_BUNDLE_INVALID -> state.copy(
            missionBundleLoaded = true,
            missionBundleVerified = false,
            lastEvent = event,
            statusNote = "Mission bundle 驗證失敗"
        )

        FlightEventType.PREFLIGHT_OK -> state.toStage(
            target = FlightStage.MISSION_READY,
            event = event,
            context = context.copy(
                missionBundleLoaded = context.missionBundleLoaded || state.missionBundleLoaded,
                missionBundleVerified = context.missionBundleVerified || state.missionBundleVerified,
                preflightReady = true
            ),
            note = "Preflight 已通過"
        ).let { next ->
            if (next.stage == FlightStage.MISSION_READY) {
                next.copy(preflightReady = true)
            } else {
                next
            }
        }

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromMissionReady(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when (event) {
        FlightEventType.MISSION_UPLOADED -> state.toStage(
            target = FlightStage.TAKEOFF,
            event = event,
            context = context.copy(
                missionUploaded = true,
                preflightReady = context.preflightReady || state.preflightReady
            ),
            note = "任務已上傳"
        ).copy(missionUploaded = true)

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromTakeoff(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when (event) {
        FlightEventType.VERIFICATION_POINT_REACHED -> state.toStage(
            target = FlightStage.BRANCH_VERIFY,
            event = event,
            context = context,
            note = "到達 verification point"
        )

        FlightEventType.INSPECTION_ZONE_REACHED -> state.toStage(
            target = FlightStage.APPROACH_VIEWPOINT,
            event = event,
            context = context,
            note = "到達 inspection zone"
        )

        FlightEventType.OBSTACLE_WARN -> state.toStage(
            target = FlightStage.LOCAL_AVOID,
            event = event,
            context = context,
            note = "進入 local avoid"
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromTransit(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when (event) {
        FlightEventType.VERIFICATION_POINT_REACHED -> state.toStage(
            target = FlightStage.BRANCH_VERIFY,
            event = event,
            context = context,
            note = "開始 branch confirm"
        )

        FlightEventType.INSPECTION_ZONE_REACHED -> state.toStage(
            target = FlightStage.APPROACH_VIEWPOINT,
            event = event,
            context = context,
            note = "開始接近 inspection viewpoint"
        )

        FlightEventType.OBSTACLE_WARN -> state.toStage(
            target = FlightStage.LOCAL_AVOID,
            event = event,
            context = context,
            note = "local avoid 啟用中"
        )

        FlightEventType.CORRIDOR_DEVIATION_WARN -> state.copy(
            lastEvent = event,
            statusNote = "走廊偏離警告"
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromBranchVerify(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when (event) {
        FlightEventType.BRANCH_VERIFY_LEFT,
        FlightEventType.BRANCH_VERIFY_RIGHT,
        FlightEventType.BRANCH_VERIFY_STRAIGHT -> state.toStage(
            target = FlightStage.TRANSIT,
            event = event,
            context = context,
            note = "Branch 已確認"
        )

        FlightEventType.BRANCH_VERIFY_UNKNOWN,
        FlightEventType.BRANCH_VERIFY_TIMEOUT,
        FlightEventType.FRAME_STREAM_DROPPED,
        FlightEventType.SEMANTIC_TIMEOUT -> state.toStage(
            target = FlightStage.HOLD,
            event = event,
            context = context,
            reason = state.holdReasonFor(event, context)
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromLocalAvoid(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when {
        context.obstacleCleared -> state.toStage(
            target = FlightStage.TRANSIT,
            event = event,
            context = context,
            note = "障礙已解除，恢復主航段"
        )

        event == FlightEventType.VERIFICATION_POINT_REACHED -> state.toStage(
            target = FlightStage.BRANCH_VERIFY,
            event = event,
            context = context,
            note = "在 verification point 結束避障"
        )

        event == FlightEventType.INSPECTION_ZONE_REACHED -> state.toStage(
            target = FlightStage.APPROACH_VIEWPOINT,
            event = event,
            context = context,
            note = "在 inspection zone 結束避障"
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromApproach(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when (event) {
        FlightEventType.VIEW_ALIGN_OK -> state.toStage(
            target = FlightStage.VIEW_ALIGN,
            event = event,
            context = context,
            note = "進入對正畫面階段"
        )

        FlightEventType.VIEW_ALIGN_TIMEOUT,
        FlightEventType.FRAME_STREAM_DROPPED -> state.toStage(
            target = FlightStage.HOLD,
            event = event,
            context = context,
            reason = state.holdReasonFor(event, context)
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromViewAlign(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when (event) {
        FlightEventType.VIEW_ALIGN_OK -> state.toStage(
            target = FlightStage.CAPTURE,
            event = event,
            context = context,
            note = "開始 Capture"
        )

        FlightEventType.VIEW_ALIGN_TIMEOUT,
        FlightEventType.FRAME_STREAM_DROPPED -> state.toStage(
            target = FlightStage.HOLD,
            event = event,
            context = context,
            reason = state.holdReasonFor(event, context)
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromCapture(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when {
        context.captureComplete && context.hasRemainingViewpoints -> state.toStage(
            target = FlightStage.TRANSIT,
            event = event,
            context = context,
            note = "Capture 完成，繼續下一個 viewpoint"
        )

        context.captureComplete -> state.toStage(
            target = FlightStage.HOLD,
            event = event,
            context = context,
            reason = "Capture 完成，等待操作員決策"
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromHold(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when (event) {
        FlightEventType.USER_RESUME_REQUESTED -> state.resumeFromHold(event, context)
        FlightEventType.USER_RTH_REQUESTED -> state.toStage(
            target = FlightStage.RTH,
            event = event,
            context = context,
            reason = "在 HOLD 中要求 RTH"
        )

        FlightEventType.USER_TAKEOVER_REQUESTED -> state.toStage(
            target = FlightStage.MANUAL_OVERRIDE,
            event = event,
            context = context,
            reason = "在 HOLD 中切換人工接管"
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromManualOverride(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = when {
        context.manualOverrideAborted -> state.toStage(
            target = FlightStage.ABORTED,
            event = event,
            context = context,
            reason = "人工接管期間中止任務"
        )

        context.manualOverrideComplete -> state.toStage(
            target = FlightStage.COMPLETED,
            event = event,
            context = context,
            note = "人工接管完成"
        )

        else -> state.copy(lastEvent = event)
    }

    private fun reduceFromRth(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = if (context.rthArrived) {
        state.toStage(
            target = FlightStage.LANDING,
            event = event,
            context = context,
            note = "RTH 抵達，開始降落"
        )
    } else {
        state.copy(lastEvent = event)
    }

    private fun reduceFromLanding(
        state: FlightState,
        event: FlightEventType,
        context: TransitionContext
    ): FlightState = if (context.landingComplete) {
        state.toStage(
            target = FlightStage.COMPLETED,
            event = event,
            context = context,
            note = "降落完成"
        )
    } else {
        state.copy(lastEvent = event)
    }

    private fun FlightState.advanceTransientStages(
        event: FlightEventType,
        context: TransitionContext
    ): FlightState {
        var current = this

        if (current.stage == FlightStage.TAKEOFF && context.takeoffComplete) {
            current = current.toStage(FlightStage.TRANSIT, event, context, note = "起飛完成，進入主航段")
        }
        if (current.stage == FlightStage.RTH && context.rthArrived) {
            current = current.toStage(FlightStage.LANDING, event, context, note = "RTH 已抵達")
        }
        if (current.stage == FlightStage.LANDING && context.landingComplete) {
            current = current.toStage(FlightStage.COMPLETED, event, context, note = "任務完成")
        }
        if (current.stage == FlightStage.MANUAL_OVERRIDE && context.manualOverrideAborted) {
            current = current.toStage(FlightStage.ABORTED, event, context, reason = "人工接管後中止任務")
        }
        if (current.stage == FlightStage.MANUAL_OVERRIDE && context.manualOverrideComplete) {
            current = current.toStage(FlightStage.COMPLETED, event, context, note = "人工飛行完成")
        }

        return current
    }

    private fun FlightState.resumeFromHold(
        event: FlightEventType,
        context: TransitionContext
    ): FlightState {
        val target = lastAutonomousStage ?: FlightStage.TRANSIT
        return toStage(
            target = target,
            event = event,
            context = context,
            note = "操作員恢復自主流程"
        )
    }

    private fun FlightState.toStage(
        target: FlightStage,
        event: FlightEventType,
        context: TransitionContext,
        reason: String? = null,
        note: String? = null
    ): FlightState {
        if (!transitionGuard.canTransition(this, event, target, context)) {
            return copy(lastEvent = event)
        }
        return copy(
            stage = target,
            missionBundleLoaded = missionBundleLoaded || context.missionBundleLoaded,
            missionBundleVerified = missionBundleVerified || context.missionBundleVerified,
            preflightReady = preflightReady || context.preflightReady,
            missionUploaded = missionUploaded || context.missionUploaded,
            authValid = context.authValid ?: authValid,
            pendingEventUploads = context.pendingEventUploads ?: pendingEventUploads,
            pendingTelemetryUploads = context.pendingTelemetryUploads ?: pendingTelemetryUploads,
            lastEvent = event,
            holdReason = if (target == FlightStage.HOLD || target == FlightStage.ABORTED) reason else null,
            lastAutonomousStage = when (target) {
                FlightStage.HOLD,
                FlightStage.MANUAL_OVERRIDE,
                FlightStage.RTH,
                FlightStage.LANDING,
                FlightStage.COMPLETED,
                FlightStage.ABORTED -> lastAutonomousStage ?: stage
                else -> target
            },
            statusNote = note ?: reason
        )
    }

    private fun FlightState.holdReasonFor(
        event: FlightEventType,
        context: TransitionContext
    ): String {
        return when {
            event == FlightEventType.BRANCH_VERIFY_TIMEOUT -> "Branch confirm 逾時"
            event == FlightEventType.BRANCH_VERIFY_UNKNOWN -> "Branch confirm 不確定"
            event == FlightEventType.OBSTACLE_HARD_STOP -> "前方障礙需要立即硬停"
            event == FlightEventType.CORRIDOR_DEVIATION_HARD -> "已超出安全走廊包絡"
            event == FlightEventType.GPS_WEAK || context.gpsWeak -> "GPS 訊號偏弱，先停住等待"
            event == FlightEventType.GPS_LOST || !context.gpsReady -> "GPS 不足以支撐安全自主飛行"
            event == FlightEventType.RC_SIGNAL_DEGRADED -> "遙控訊號不穩定"
            event == FlightEventType.RC_SIGNAL_LOST || !context.rcSignalHealthy -> "遙控訊號中斷"
            event == FlightEventType.APP_HEALTH_BAD || !context.appHealthy -> "App health 不適合繼續自主飛行"
            event == FlightEventType.FRAME_STREAM_DROPPED || !context.frameStreamHealthy -> "相機 frame stream 已中斷"
            event == FlightEventType.SEMANTIC_TIMEOUT -> "語義確認逾時"
            event == FlightEventType.DEVICE_HEALTH_BLOCKING || context.deviceHealthBlocking -> "裝置健康狀態阻擋飛行"
            else -> "等待操作員決策"
        }
    }
}

fun FlightStage.toDisplayLabel(): String = when (this) {
    FlightStage.IDLE -> "待命"
    FlightStage.PRECHECK -> "Preflight"
    FlightStage.MISSION_READY -> "任務待上傳"
    FlightStage.TAKEOFF -> "起飛"
    FlightStage.TRANSIT -> "主航段"
    FlightStage.BRANCH_VERIFY -> "Branch Confirm"
    FlightStage.LOCAL_AVOID -> "局部避障"
    FlightStage.APPROACH_VIEWPOINT -> "接近 Viewpoint"
    FlightStage.VIEW_ALIGN -> "對正畫面"
    FlightStage.CAPTURE -> "Capture"
    FlightStage.HOLD -> "停住等待"
    FlightStage.MANUAL_OVERRIDE -> "人工接管"
    FlightStage.RTH -> "返航"
    FlightStage.LANDING -> "降落"
    FlightStage.COMPLETED -> "已完成"
    FlightStage.ABORTED -> "已中止"
}
