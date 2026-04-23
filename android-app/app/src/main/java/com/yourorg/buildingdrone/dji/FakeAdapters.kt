package com.yourorg.buildingdrone.dji

import android.app.Application
import android.view.TextureView
import com.yourorg.buildingdrone.core.GeoPoint
import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.domain.semantic.BranchDecision
import com.yourorg.buildingdrone.domain.semantic.BranchPrompt
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.util.zip.ZipFile

class FakeMobileSdkSession(
    initialState: SdkSessionState = SdkSessionState(
        initialized = true,
        registered = true,
        networkAvailable = true,
        initProgress = 100
    )
) : MobileSdkSession {
    private val mutableState = MutableStateFlow(initialState)

    override val state: StateFlow<SdkSessionState> = mutableState.asStateFlow()

    override fun initialize(application: Application) {
        mutableState.value = mutableState.value.copy(initialized = true, registered = true, initProgress = 100)
    }

    override fun retryRegistration() {
        mutableState.value = mutableState.value.copy(registered = true, lastError = null)
    }

    override fun destroy() = Unit
}

class FakeHardwareStatusProvider(
    private var snapshot: HardwareSnapshot = HardwareSnapshot(
        sdkRegistered = true,
        aircraftConnected = true,
        remoteControllerConnected = true,
        productType = "Mini 4 Pro",
        firmwareVersion = "demo-fw",
        gpsSatelliteCount = 12,
        gpsSignalLevel = "LEVEL_4",
        userAccount = UserAccountState(loggedIn = true, accountId = "demo-operator")
    )
) : HardwareStatusProvider {
    override fun currentSnapshot(): HardwareSnapshot = snapshot

    fun update(snapshot: HardwareSnapshot) {
        this.snapshot = snapshot
    }
}

class FakeWaypointMissionAdapter : WaypointMissionAdapter {
    private var loadedMission: MissionLoadStatus? = null
    private var lastUploadedMissionId: String? = null
    private var executionState: MissionExecutionState = MissionExecutionState.IDLE
    private var lastError: String? = null

    override suspend fun loadKmzMission(request: MissionLoadRequest): MissionLoadStatus {
        val file = File(request.kmzPath)
        loadedMission = if (!file.exists()) {
            MissionLoadStatus(valid = false, error = "KMZ file not found")
        } else {
            ZipFile(file).use { zip ->
                val entries = zip.entries().asSequence().toList()
                MissionLoadStatus(
                    valid = entries.any { it.name.endsWith(".wpml") || it.name.endsWith(".kml") },
                    missionId = request.expectedMissionId,
                    waylineCount = entries.count { it.name.endsWith(".wpml") },
                    entryCount = entries.size,
                    sizeBytes = file.length()
                )
            }
        }
        executionState = if (loadedMission?.valid == true) MissionExecutionState.LOADED else MissionExecutionState.FAILED
        return loadedMission!!
    }

    override suspend fun uploadMission(missionBundle: MissionBundle): Boolean {
        lastUploadedMissionId = missionBundle.missionId
        executionState = MissionExecutionState.UPLOADED
        lastError = null
        return true
    }

    override suspend fun startMission(): Boolean {
        val canStart = executionState == MissionExecutionState.UPLOADED || executionState == MissionExecutionState.PAUSED
        if (canStart) {
            executionState = MissionExecutionState.RUNNING
            lastError = null
        } else {
            lastError = "Mission is not uploaded."
        }
        return canStart
    }

    override suspend fun pauseMission(): Boolean {
        val canPause = executionState == MissionExecutionState.RUNNING
        if (canPause) {
            executionState = MissionExecutionState.PAUSED
            lastError = null
        } else {
            lastError = "Mission is not running."
        }
        return canPause
    }

    override suspend fun resumeMission(): Boolean = startMission()

    override suspend fun stopMission(): Boolean {
        val hadMission = executionState != MissionExecutionState.IDLE
        executionState = MissionExecutionState.STOPPED
        lastError = if (hadMission) null else "No active mission."
        return hadMission
    }

    override fun executionState(): MissionExecutionState = executionState

    override fun lastLoadedMission(): MissionLoadStatus? = loadedMission

    override fun lastCommandError(): String? = lastError

    fun lastUploadedMissionId(): String? = lastUploadedMissionId
}

class FakeFlightControlAdapter : FlightControlAdapter {
    private var airborne = false
    private var autoLandingActive = false
    private var landingConfirmationNeeded = false
    private var confirmLandingSupported = true
    private var lastError: String? = null

    override suspend fun takeoff(): Boolean {
        return if (airborne) {
            lastError = "Aircraft is already airborne."
            false
        } else {
            airborne = true
            autoLandingActive = false
            lastError = null
            true
        }
    }

    override suspend fun startAutoLanding(): Boolean {
        return if (!airborne) {
            lastError = "Aircraft is not airborne."
            false
        } else {
            autoLandingActive = true
            lastError = null
            if (!landingConfirmationNeeded) {
                airborne = false
                autoLandingActive = false
            }
            true
        }
    }

    override suspend fun stopAutoLanding(): Boolean {
        return if (!autoLandingActive) {
            lastError = "Auto landing is not active."
            false
        } else {
            autoLandingActive = false
            lastError = null
            true
        }
    }

    override suspend fun confirmLanding(): Boolean {
        return if (!autoLandingActive) {
            lastError = "Landing confirmation is not active."
            false
        } else if (!confirmLandingSupported) {
            lastError = "Confirm landing is unsupported on this fake path."
            false
        } else {
            autoLandingActive = false
            landingConfirmationNeeded = false
            airborne = false
            lastError = null
            true
        }
    }

    override fun isLandingConfirmationNeeded(): Boolean = autoLandingActive && landingConfirmationNeeded

    override fun lastCommandError(): String? = lastError

    fun airborne(): Boolean = airborne

    fun requireLandingConfirmation(required: Boolean) {
        landingConfirmationNeeded = required
    }

    fun setConfirmLandingSupported(supported: Boolean) {
        confirmLandingSupported = supported
    }
}

class FakeVirtualStickAdapter : VirtualStickAdapter {
    private val commands = mutableListOf<VirtualStickCommand>()
    private var status = VirtualStickStatus()

    override suspend fun enable(window: VirtualStickWindow): Boolean {
        status = VirtualStickStatus(enabled = true, activeWindow = window)
        return true
    }

    override suspend fun disable(): Boolean {
        status = VirtualStickStatus()
        return true
    }

    override suspend fun send(command: VirtualStickCommand): Boolean {
        if (!status.enabled) {
            status = status.copy(lastError = "Virtual stick is not enabled")
            return false
        }
        commands += command
        return true
    }

    override fun status(): VirtualStickStatus = status

    fun commands(): List<VirtualStickCommand> = commands.toList()
}

class FakeCameraStreamAdapter : CameraStreamAdapter {
    private val listeners = linkedMapOf<String, (CameraFrameSample) -> Unit>()
    private var status = CameraStreamStatus(
        available = true,
        streaming = false,
        selectedCameraIndex = "LEFT_OR_MAIN",
        sourceAvailable = true
    )

    override fun status(): CameraStreamStatus = status

    override fun addFrameListener(listenerId: String, listener: (CameraFrameSample) -> Unit) {
        listeners[listenerId] = listener
    }

    override fun removeFrameListener(listenerId: String) {
        listeners.remove(listenerId)
    }

    override suspend fun start(): Boolean {
        status = CameraStreamStatus(
            available = true,
            streaming = true,
            selectedCameraIndex = "LEFT_OR_MAIN",
            sourceAvailable = true,
            lastFrameTimestampMillis = System.currentTimeMillis()
        )
        emitFrame()
        return true
    }

    override suspend fun stop(): Boolean {
        status = status.copy(streaming = false)
        return true
    }

    override fun bindPreview(textureView: TextureView): Boolean = true

    override fun unbindPreview(textureView: TextureView) = Unit

    fun emitFrame() {
        val frame = CameraFrameSample(
            width = 1280,
            height = 720,
            format = "YUV420",
            timestampMillis = System.currentTimeMillis()
        )
        status = status.copy(lastFrameTimestampMillis = frame.timestampMillis)
        listeners.values.forEach { it(frame) }
    }
}

class FakeCameraControlAdapter : CameraControlAdapter {
    private var status = CameraControlStatus(available = true, recording = false, gimbalPitchDegrees = 0.0)
    private var lastError: String? = null

    override fun status(): CameraControlStatus = status.copy(lastError = lastError)

    override suspend fun takePhoto(): Boolean {
        lastError = null
        return true
    }

    override suspend fun startRecording(): Boolean {
        status = status.copy(recording = true)
        lastError = null
        return true
    }

    override suspend fun stopRecording(): Boolean {
        status = status.copy(recording = false)
        lastError = null
        return true
    }

    override suspend fun adjustGimbalPitch(deltaDegrees: Double): Boolean {
        status = status.copy(gimbalPitchDegrees = (status.gimbalPitchDegrees + deltaDegrees).coerceIn(-90.0, 30.0))
        lastError = null
        return true
    }

    override fun lastCommandError(): String? = lastError
}

class FakePerceptionAdapter(
    queuedResults: List<BranchDecision> = emptyList(),
    private var snapshot: PerceptionSnapshot = PerceptionSnapshot()
) : PerceptionAdapter {
    private val remainingResults = ArrayDeque(queuedResults)
    private val listeners = linkedMapOf<String, (PerceptionSnapshot) -> Unit>()

    override fun currentSnapshot(): PerceptionSnapshot = snapshot

    override fun addObstacleListener(listenerId: String, listener: (PerceptionSnapshot) -> Unit) {
        listeners[listenerId] = listener
    }

    override fun removeObstacleListener(listenerId: String) {
        listeners.remove(listenerId)
    }

    override suspend fun confirmBranch(prompt: BranchPrompt): BranchDecision {
        return remainingResults.removeFirstOrNull()
            ?.takeIf { prompt.expectedOptions.contains(it) }
            ?: BranchDecision.UNKNOWN
    }

    fun updateSnapshot(snapshot: PerceptionSnapshot) {
        this.snapshot = snapshot
        listeners.values.forEach { it(snapshot) }
    }
}

class FakeSimulatorAdapter(
    initialStatus: SimulatorStatus = SimulatorStatus()
) : SimulatorAdapter {
    private val listeners = linkedMapOf<String, (SimulatorStatus) -> Unit>()
    private var status = initialStatus

    override fun status(): SimulatorStatus = status

    override fun addStateListener(listenerId: String, listener: (SimulatorStatus) -> Unit) {
        listeners[listenerId] = listener
    }

    override fun removeStateListener(listenerId: String) {
        listeners.remove(listenerId)
    }

    override suspend fun enable(initialLocation: GeoPoint, altitudeMeters: Double): Boolean {
        status = SimulatorStatus(
            enabled = true,
            location = initialLocation,
            altitudeMeters = altitudeMeters,
            satelliteCount = 12
        )
        publish()
        return true
    }

    override suspend fun disable(): Boolean {
        status = SimulatorStatus()
        publish()
        return true
    }

    fun advance(location: GeoPoint, altitudeMeters: Double) {
        status = status.copy(location = location, altitudeMeters = altitudeMeters)
        publish()
    }

    private fun publish() {
        listeners.values.forEach { it(status) }
    }
}
