package com.yourorg.buildingdrone.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.yourorg.buildingdrone.data.ActiveFlightContext
import com.yourorg.buildingdrone.data.BlackboxRecorder
import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.data.MissionSyncResult
import com.yourorg.buildingdrone.data.network.TelemetrySampleWire
import com.yourorg.buildingdrone.data.upload.UploadBacklogSnapshot
import com.yourorg.buildingdrone.dji.HardwareSnapshot
import com.yourorg.buildingdrone.dji.PerceptionSnapshot
import com.yourorg.buildingdrone.dji.SimulatorStatus
import com.yourorg.buildingdrone.domain.statemachine.FlightEventType
import com.yourorg.buildingdrone.domain.statemachine.FlightStage
import com.yourorg.buildingdrone.feature.auth.OperatorLoginScreen
import com.yourorg.buildingdrone.feature.transit.TransitUiState
import com.yourorg.buildingdrone.ui.BuildingDroneTheme
import com.yourorg.buildingdrone.ui.ConsoleHomeScreen
import kotlinx.coroutines.launch
import java.time.Instant

class MainActivity : ComponentActivity() {
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
            var activeFlightContext by remember { mutableStateOf<ActiveFlightContext?>(null) }
            var lastUploadedEventKey by remember { mutableStateOf<String?>(null) }
            var attachedBundle by remember { mutableStateOf<MissionBundle?>(null) }
            var lastIncidentExportKey by remember { mutableStateOf<String?>(null) }
            val blackboxRecorder = remember(container) {
                BlackboxRecorder(
                    repository = container.flightLogRepository,
                    exportDirectory = application.filesDir.resolve("incident-exports")
                )
            }

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
                        container.evaluatePreflight(attachedBundle)
                    },
                    syncReporter = syncReporter@{ state ->
                        val uploadRepository = container.flightUploadRepository
                            ?: return@syncReporter NetworkSyncStatus()
                        val flightContext = activeFlightContext
                            ?: return@syncReporter uploadRepository.snapshot().toCoordinatorStatus()
                        val eventType = state.lastEvent
                            ?: return@syncReporter uploadRepository.snapshot().toCoordinatorStatus()
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
                            state.holdReason ?: ""
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
                    }
                )
            }

            LaunchedEffect(Unit) {
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
                    blackboxRecorder.exportIncident(
                        missionId = missionId,
                        flightId = flightId,
                        stage = state.stage,
                        reason = state.holdReason ?: coordinator.emergency.reason
                    )
                    lastIncidentExportKey = exportKey
                }
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
                    ConsoleHomeScreen(demoCoordinator = coordinator)
                }
            }
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

private fun UploadBacklogSnapshot.toCoordinatorStatus(): NetworkSyncStatus {
    return NetworkSyncStatus(
        authValid = authValid,
        pendingEventUploads = pendingEventUploads,
        pendingTelemetryUploads = pendingTelemetryUploads,
        statusNote = statusNote
    )
}
