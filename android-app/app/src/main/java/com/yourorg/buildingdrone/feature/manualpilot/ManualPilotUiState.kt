package com.yourorg.buildingdrone.feature.manualpilot

import com.yourorg.buildingdrone.feature.transit.TelemetryField
import com.yourorg.buildingdrone.ui.ScreenDataState

data class ManualPilotUiState(
    val status: ScreenDataState = ScreenDataState.EMPTY,
    val consoleLabel: String,
    val summary: String,
    val warning: String? = null,
    val nextStep: String = "確認相機預覽與操控狀態後，再視需要執行保守手動飛行。",
    val previewAvailable: Boolean = false,
    val previewStreaming: Boolean = false,
    val cameraStreamState: String = "unavailable",
    val recording: Boolean = false,
    val recordingState: String = "idle",
    val gimbalPitchLabel: String = "0°",
    val telemetry: List<TelemetryField> = emptyList(),
    val manualAssistHint: String = "Manual Pilot 使用 Android 本地 virtual stick，離開此模式後會立即停止命令串流。",
    val canTakePhoto: Boolean = false,
    val canStartRecording: Boolean = false,
    val canStopRecording: Boolean = false,
    val canTiltUp: Boolean = false,
    val canTiltDown: Boolean = false,
    val canReturnToHome: Boolean = false,
)
