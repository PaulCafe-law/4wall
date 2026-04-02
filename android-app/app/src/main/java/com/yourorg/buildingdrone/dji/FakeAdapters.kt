package com.yourorg.buildingdrone.dji

import android.app.Application
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
        return true
    }

    override suspend fun startMission(): Boolean {
        val canStart = executionState == MissionExecutionState.UPLOADED || executionState == MissionExecutionState.PAUSED
        if (canStart) {
            executionState = MissionExecutionState.RUNNING
        }
        return canStart
    }

    override suspend fun pauseMission(): Boolean {
        val canPause = executionState == MissionExecutionState.RUNNING
        if (canPause) {
            executionState = MissionExecutionState.PAUSED
        }
        return canPause
    }

    override suspend fun resumeMission(): Boolean = startMission()

    override suspend fun stopMission(): Boolean {
        val hadMission = executionState != MissionExecutionState.IDLE
        executionState = MissionExecutionState.STOPPED
        return hadMission
    }

    override fun executionState(): MissionExecutionState = executionState

    override fun lastLoadedMission(): MissionLoadStatus? = loadedMission

    fun lastUploadedMissionId(): String? = lastUploadedMissionId
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
    private var status = CameraStreamStatus(available = true, streaming = false)

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
            lastFrameTimestampMillis = System.currentTimeMillis()
        )
        emitFrame()
        return true
    }

    override suspend fun stop(): Boolean {
        status = status.copy(streaming = false)
        return true
    }

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
