package com.yourorg.buildingdrone.dji

import android.app.Application
import android.view.TextureView
import androidx.lifecycle.DefaultLifecycleObserver
import com.yourorg.buildingdrone.core.GeoPoint
import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.domain.operations.AutonomyCapability
import com.yourorg.buildingdrone.domain.semantic.BranchDecision
import com.yourorg.buildingdrone.domain.semantic.BranchPrompt
import kotlinx.coroutines.flow.StateFlow

data class SdkSessionState(
    val initialized: Boolean = false,
    val registered: Boolean = false,
    val networkAvailable: Boolean = false,
    val initProgress: Int = 0,
    val lastError: String? = null
)

interface MobileSdkSession : DefaultLifecycleObserver {
    val state: StateFlow<SdkSessionState>
    fun initialize(application: Application)
    fun retryRegistration() = Unit
    fun destroy()
}

data class UserAccountState(
    val loggedIn: Boolean = false,
    val accountId: String? = null
)

data class DeviceHealthState(
    val blocking: Boolean = false,
    val summary: String? = null
)

data class FlyZoneState(
    val blocking: Boolean = false,
    val summary: String? = null
)

data class HardwareSnapshot(
    val sdkRegistered: Boolean = false,
    val aircraftConnected: Boolean = false,
    val remoteControllerConnected: Boolean = false,
    val productType: String? = null,
    val firmwareVersion: String? = null,
    val isFlying: Boolean = false,
    val ultrasonicHeightDm: Int? = null,
    val gpsSatelliteCount: Int = 0,
    val gpsSignalLevel: String? = null,
    val userAccount: UserAccountState = UserAccountState(),
    val deviceHealth: DeviceHealthState = DeviceHealthState(),
    val flyZone: FlyZoneState = FlyZoneState(),
    val indoorAutonomyCapability: AutonomyCapability = AutonomyCapability.UNKNOWN
) {
    val gpsReady: Boolean
        get() = gpsSatelliteCount >= 8 && gpsSignalLevel !in setOf(null, "LEVEL_0", "LEVEL_1")
}

interface HardwareStatusProvider {
    fun currentSnapshot(): HardwareSnapshot
}

data class MissionLoadRequest(
    val kmzPath: String,
    val expectedMissionId: String
)

data class MissionLoadStatus(
    val valid: Boolean,
    val missionId: String? = null,
    val waylineCount: Int = 0,
    val entryCount: Int = 0,
    val sizeBytes: Long = 0L,
    val error: String? = null
)

enum class MissionExecutionState {
    IDLE,
    LOADED,
    UPLOADED,
    RUNNING,
    PAUSED,
    STOPPED,
    FAILED
}

data class VirtualStickCommand(
    val pitch: Float = 0f,
    val roll: Float = 0f,
    val yaw: Float = 0f,
    val throttle: Float = 0f
)

enum class VirtualStickWindow {
    LOCAL_AVOID,
    APPROACH_VIEWPOINT,
    VIEW_ALIGN_RECOVERY,
    OPERATOR_MICRO_ADJUST
}

data class VirtualStickStatus(
    val enabled: Boolean = false,
    val activeWindow: VirtualStickWindow? = null,
    val lastError: String? = null
)

data class CameraFrameSample(
    val width: Int,
    val height: Int,
    val format: String,
    val timestampMillis: Long
)

data class CameraStreamStatus(
    val available: Boolean = false,
    val streaming: Boolean = false,
    val selectedCameraIndex: String? = null,
    val sourceAvailable: Boolean = false,
    val startupTimedOut: Boolean = false,
    val lastError: String? = null,
    val lastFrameTimestampMillis: Long? = null
)

data class CameraControlStatus(
    val available: Boolean = false,
    val recording: Boolean = false,
    val gimbalPitchDegrees: Double = 0.0,
    val lastError: String? = null
)

data class PerceptionSnapshot(
    val obstacleDetected: Boolean = false,
    val hardStopRequired: Boolean = false,
    val summary: String? = null
)

data class SimulatorStatus(
    val enabled: Boolean = false,
    val location: GeoPoint? = null,
    val altitudeMeters: Double = 0.0,
    val satelliteCount: Int = 0
)

interface WaypointMissionAdapter {
    suspend fun loadKmzMission(request: MissionLoadRequest): MissionLoadStatus
    suspend fun uploadMission(missionBundle: MissionBundle): Boolean
    suspend fun startMission(): Boolean
    suspend fun pauseMission(): Boolean
    suspend fun resumeMission(): Boolean
    suspend fun stopMission(): Boolean
    fun executionState(): MissionExecutionState
    fun lastLoadedMission(): MissionLoadStatus?
    fun lastCommandError(): String? = null
}

interface FlightControlAdapter {
    suspend fun takeoff(): Boolean
    suspend fun startAutoLanding(): Boolean
    suspend fun stopAutoLanding(): Boolean
    suspend fun confirmLanding(): Boolean
    fun isLandingConfirmationNeeded(): Boolean = false
    suspend fun land(): Boolean = startAutoLanding()
    fun lastCommandError(): String? = null
}

interface VirtualStickAdapter {
    suspend fun enable(window: VirtualStickWindow): Boolean
    suspend fun disable(): Boolean
    suspend fun send(command: VirtualStickCommand): Boolean
    fun status(): VirtualStickStatus
}

interface CameraStreamAdapter {
    fun status(): CameraStreamStatus
    fun addFrameListener(listenerId: String, listener: (CameraFrameSample) -> Unit)
    fun removeFrameListener(listenerId: String)
    suspend fun start(): Boolean
    suspend fun stop(): Boolean
    fun bindPreview(textureView: TextureView): Boolean = false
    fun unbindPreview(textureView: TextureView) = Unit
}

interface CameraControlAdapter {
    fun status(): CameraControlStatus
    suspend fun takePhoto(): Boolean
    suspend fun startRecording(): Boolean
    suspend fun stopRecording(): Boolean
    suspend fun adjustGimbalPitch(deltaDegrees: Double): Boolean
    fun lastCommandError(): String? = null
}

interface PerceptionAdapter {
    fun currentSnapshot(): PerceptionSnapshot
    fun addObstacleListener(listenerId: String, listener: (PerceptionSnapshot) -> Unit)
    fun removeObstacleListener(listenerId: String)
    suspend fun confirmBranch(prompt: BranchPrompt): BranchDecision
}

interface SimulatorAdapter {
    fun status(): SimulatorStatus
    fun addStateListener(listenerId: String, listener: (SimulatorStatus) -> Unit)
    fun removeStateListener(listenerId: String)
    suspend fun enable(initialLocation: GeoPoint, altitudeMeters: Double): Boolean
    suspend fun disable(): Boolean
    fun lastCommandError(): String? = null
}
