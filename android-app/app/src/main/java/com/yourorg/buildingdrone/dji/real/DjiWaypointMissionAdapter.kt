package com.yourorg.buildingdrone.dji.real

import android.util.Log
import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.dji.MissionExecutionState
import com.yourorg.buildingdrone.dji.MissionLoadRequest
import com.yourorg.buildingdrone.dji.MissionLoadStatus
import com.yourorg.buildingdrone.dji.WaypointMissionAdapter
import com.yourorg.buildingdrone.dji.WaypointMissionDiagnostic
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.v5.manager.aircraft.waypoint3.WaylineExecutingInfoListener
import dji.v5.manager.aircraft.waypoint3.WaypointMissionExecuteStateListener
import dji.v5.manager.aircraft.waypoint3.WaypointMissionManager
import java.io.File
import java.security.MessageDigest
import java.util.zip.ZipFile
import kotlin.coroutines.resume
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

class DjiWaypointMissionAdapter(
    private val gateway: Gateway = RealGateway(),
    private val commandTimeoutMillis: Long = 45_000L,
    private val executionStartTimeoutMillis: Long = 15_000L,
    private val attachWaylineInfoListener: Boolean = true,
) : WaypointMissionAdapter {
    interface Gateway {
        fun uploadKmz(path: String, callback: CommonCallbacks.CompletionCallbackWithProgress<Double>)
        fun startMission(missionFileName: String, callback: CommonCallbacks.CompletionCallback)
        fun startMission(missionFileName: String, waylineIds: List<Int>, callback: CommonCallbacks.CompletionCallback)
        fun pauseMission(callback: CommonCallbacks.CompletionCallback)
        fun resumeMission(callback: CommonCallbacks.CompletionCallback)
        fun stopMission(missionFileName: String, callback: CommonCallbacks.CompletionCallback)
        fun availableWaylineIds(missionFileName: String): List<Int>
        fun setExecutionStateObserver(observer: ((String) -> Unit)?)
        fun setWaylineInfoObserver(observer: ((String, Int, Int) -> Unit)?)
        fun setWaylineInterruptObserver(observer: ((String) -> Unit)?)
    }

    private var loadedMission: MissionLoadStatus? = null
    private var loadedMissionPath: String? = null
    private var loadedMissionId: String? = null
    private var loadedMissionFileName: String? = null
    private var loadedMissionSha256: String? = null
    private var executionState = MissionExecutionState.IDLE
    private var lastCommandError: String? = null
    private var uploadProgressPercent: Int? = null
    private var lastAvailableWaylineIds: List<Int> = emptyList()
    private var lastStartOverload: String? = null
    private var lastDjiExecuteState: String? = null
    private var lastWaylineExecutingInfo: String? = null
    private var lastInterruptReason: String? = null
    private var executionListenersAttached = false
    private var startStateAwaiter: CompletableDeferred<String>? = null

    override suspend fun loadKmzMission(request: MissionLoadRequest): MissionLoadStatus {
        val file = File(request.kmzPath)
        loadedMission = if (!file.exists()) {
            MissionLoadStatus(valid = false, error = "KMZ file not found")
        } else {
            ZipFile(file).use { zip ->
                val entries = zip.entries().asSequence().toList()
                val names = entries.map { it.name }.toSet()
                val valid = "wpmz/template.kml" in names && "wpmz/waylines.wpml" in names
                MissionLoadStatus(
                    valid = valid,
                    missionId = request.expectedMissionId,
                    waylineCount = entries.count { it.name.endsWith(".wpml") },
                    entryCount = entries.size,
                    sizeBytes = file.length(),
                    error = if (valid) null else "KMZ missing DJI WPML entries."
                )
            }
        }
        loadedMissionPath = request.kmzPath
        loadedMissionId = request.expectedMissionId
        loadedMissionFileName = file.name
        loadedMissionSha256 = if (file.exists()) sha256(file.readBytes()) else null
        lastAvailableWaylineIds = emptyList()
        lastStartOverload = null
        lastDjiExecuteState = null
        lastWaylineExecutingInfo = null
        lastInterruptReason = null
        lastCommandError = loadedMission?.error
        executionState = if (loadedMission?.valid == true) MissionExecutionState.LOADED else MissionExecutionState.FAILED
        logInfo("loadKmzMission ${diagnosticSnapshot().compactSummary()}")
        return loadedMission!!
    }

    override suspend fun uploadMission(missionBundle: MissionBundle): Boolean {
        val kmzPath = missionBundle.artifacts.missionKmz.localPath
        if (kmzPath.isBlank() || kmzPath.startsWith("embedded://")) {
            executionState = MissionExecutionState.FAILED
            lastCommandError = "Mission KMZ path is missing."
            return false
        }
        if (loadedMissionPath != kmzPath) {
            val loadStatus = loadKmzMission(
                MissionLoadRequest(
                    kmzPath = kmzPath,
                    expectedMissionId = missionBundle.missionId
                )
            )
            if (!loadStatus.valid) {
                executionState = MissionExecutionState.FAILED
                lastCommandError = loadStatus.error ?: "KMZ validation failed."
                return false
            }
        }

        uploadProgressPercent = 0
        logInfo("pushKMZFileToAircraft requested ${diagnosticSnapshot().compactSummary()}")
        val uploaded = withTimeoutOrNull(commandTimeoutMillis) {
            suspendCancellableCoroutine { continuation ->
                val callback = object : CommonCallbacks.CompletionCallbackWithProgress<Double> {
                    override fun onProgressUpdate(progress: Double) {
                        uploadProgressPercent = progress.asPercent()
                        logInfo("pushKMZFileToAircraft progress=$uploadProgressPercent")
                    }

                    override fun onSuccess() {
                        uploadProgressPercent = 100
                        lastCommandError = null
                        logInfo("pushKMZFileToAircraft success ${diagnosticSnapshot().compactSummary()}")
                        if (continuation.isActive) {
                            continuation.resume(true)
                        }
                    }

                    override fun onFailure(error: IDJIError) {
                        lastCommandError = normalizeErrorMessage(error)
                        logWarn("pushKMZFileToAircraft failure: $lastCommandError")
                        if (continuation.isActive) {
                            continuation.resume(false)
                        }
                    }
                }
                runCatching { gateway.uploadKmz(kmzPath, callback) }
                    .onFailure { error ->
                        lastCommandError = error.message ?: error::class.java.simpleName
                        logError("pushKMZFileToAircraft threw before callback", error)
                        if (continuation.isActive) {
                            continuation.resume(false)
                        }
                    }
            }
        } ?: run {
            lastCommandError = "DJI waypoint mission upload timed out after ${commandTimeoutMillis}ms."
            logError(lastCommandError!!)
            false
        }
        executionState = if (uploaded) MissionExecutionState.UPLOADED else MissionExecutionState.FAILED
        return uploaded
    }

    override suspend fun startMission(): Boolean {
        if (executionState !in setOf(MissionExecutionState.UPLOADED, MissionExecutionState.PAUSED)) {
            lastCommandError = "Mission is not uploaded."
            return false
        }
        val missionFileName = loadedMissionFileName ?: run {
            lastCommandError = "No loaded mission file name."
            return false
        }
        ensureExecutionListenersAttached()
        val waylineIds = gateway.availableWaylineIds(missionFileName)
        lastAvailableWaylineIds = waylineIds
        val effectiveWaylineIds = waylineIds.ifEmpty { listOf(DEFAULT_WAYLINE_ID) }
        lastStartOverload = if (waylineIds.isEmpty()) {
            "list-fallback-[0]"
        } else {
            "list-$effectiveWaylineIds"
        }
        if (waylineIds.isEmpty()) {
            logWarn("getAvailableWaylineIDs returned empty; trying explicit waylineId=0 diagnostic path. ${diagnosticSnapshot().compactSummary()}")
        }
        logInfo("startMission requested ${diagnosticSnapshot().compactSummary()}")
        startStateAwaiter = CompletableDeferred()
        val commandAccepted = suspendCompletion("startMission") { callback ->
            gateway.startMission(missionFileName, effectiveWaylineIds, callback)
        }
        if (!commandAccepted) {
            startStateAwaiter = null
            executionState = MissionExecutionState.FAILED
            lastCommandError = "startMission rejected by DJI. ${diagnosticSnapshot().compactSummary()}"
            logWarn(lastCommandError!!)
            return false
        }
        val observedStartState = withTimeoutOrNull(executionStartTimeoutMillis) {
            startStateAwaiter?.await()
        }
        startStateAwaiter = null
        val started = observedStartState?.isExecutionStartedStateName() == true
        if (!started) {
            lastCommandError = buildStartObservationFailure(observedStartState)
            logWarn(lastCommandError!!)
        }
        executionState = if (started) MissionExecutionState.RUNNING else MissionExecutionState.FAILED
        return started
    }

    override suspend fun pauseMission(): Boolean {
        val paused = suspendCompletion("pauseMission") { gateway.pauseMission(it) }
        executionState = if (paused) MissionExecutionState.PAUSED else executionState
        return paused
    }

    override suspend fun resumeMission(): Boolean {
        val resumed = suspendCompletion("resumeMission") { gateway.resumeMission(it) }
        executionState = if (resumed) MissionExecutionState.RUNNING else executionState
        return resumed
    }

    override suspend fun stopMission(): Boolean {
        val missionFileName = loadedMissionFileName ?: run {
            lastCommandError = "No loaded mission file name."
            return false
        }
        val stopped = suspendCompletion("stopMission") { gateway.stopMission(missionFileName, it) }
        executionState = if (stopped) MissionExecutionState.STOPPED else executionState
        return stopped
    }

    override fun executionState(): MissionExecutionState = executionState

    override fun lastLoadedMission(): MissionLoadStatus? = loadedMission

    override fun uploadProgressPercent(): Int? = uploadProgressPercent

    override fun lastCommandError(): String? = lastCommandError

    override fun diagnosticSnapshot(): WaypointMissionDiagnostic = WaypointMissionDiagnostic(
        missionId = loadedMissionId,
        missionFileName = loadedMissionFileName,
        kmzPath = loadedMissionPath,
        kmzSha256 = loadedMissionSha256,
        kmzSizeBytes = loadedMission?.sizeBytes ?: 0L,
        availableWaylineIds = lastAvailableWaylineIds,
        startOverload = lastStartOverload,
        djiExecuteState = lastDjiExecuteState,
        waylineExecutingInfo = lastWaylineExecutingInfo,
        interruptReason = lastInterruptReason,
        lastError = lastCommandError
    )

    private fun ensureExecutionListenersAttached() {
        if (executionListenersAttached) {
            return
        }
        runCatching {
            gateway.setExecutionStateObserver { state ->
                lastDjiExecuteState = state
                logInfo("waypoint execute state=$state")
                if (state.isExecutionStartedStateName() || state.isStartFailureStateName()) {
                    startStateAwaiter?.complete(state)
                }
            }
            if (attachWaylineInfoListener) {
                gateway.setWaylineInfoObserver { missionFileName, waylineId, waypointIndex ->
                    lastWaylineExecutingInfo = "mission=$missionFileName, wayline=$waylineId, waypoint=$waypointIndex"
                    logInfo("wayline executing info $lastWaylineExecutingInfo")
                }
                gateway.setWaylineInterruptObserver { message ->
                    lastInterruptReason = message
                    lastCommandError = "DJI waypoint interrupted: $message"
                    logWarn(lastCommandError!!)
                }
            }
            executionListenersAttached = true
        }.onFailure { error ->
            lastCommandError = "Unable to attach DJI waypoint execution listeners: ${error.message}"
            logError(lastCommandError!!, error)
        }
    }

    private fun buildStartObservationFailure(observedState: String?): String {
        return when (observedState) {
            "NOT_SUPPORTED" ->
                "DJI waypoint mission is not supported by the connected aircraft/controller path."
            "INTERRUPTED" ->
                "DJI waypoint mission was interrupted before entering execution. ${executionSummary()}"
            "DISCONNECTED" ->
                "DJI waypoint mission disconnected before entering execution. ${executionSummary()}"
            else ->
                "DJI accepted startMission but did not enter waypoint execution within " +
                    "${executionStartTimeoutMillis}ms. ${executionSummary()}"
        }
    }

    private fun executionSummary(): String {
        val state = lastDjiExecuteState ?: "none"
        val info = lastWaylineExecutingInfo ?: "none"
        val interrupt = lastInterruptReason ?: "none"
        return "Last DJI state=$state; wayline info=$info; interrupt=$interrupt; ${diagnosticSnapshot().compactSummary()}."
    }

    private fun Double.asPercent(): Int {
        val normalized = if (this <= 1.0) this * 100.0 else this
        return normalized.coerceIn(0.0, 100.0).toInt()
    }

    private suspend fun suspendCompletion(
        commandName: String,
        block: (CommonCallbacks.CompletionCallback) -> Unit
    ): Boolean {
        return withTimeoutOrNull(commandTimeoutMillis) {
            suspendCancellableCoroutine { continuation ->
                val callback = object : CommonCallbacks.CompletionCallback {
                    override fun onSuccess() {
                        lastCommandError = null
                        logInfo("$commandName success")
                        if (continuation.isActive) {
                            continuation.resume(true)
                        }
                    }

                    override fun onFailure(error: IDJIError) {
                        lastCommandError = normalizeErrorMessage(error)
                        logWarn("$commandName failure: $lastCommandError")
                        if (continuation.isActive) {
                            continuation.resume(false)
                        }
                    }
                }
                runCatching { block(callback) }
                    .onFailure { error ->
                        lastCommandError = error.message ?: error::class.java.simpleName
                        logError("$commandName threw before callback", error)
                        if (continuation.isActive) {
                            continuation.resume(false)
                        }
                    }
            }
        } ?: run {
            lastCommandError = "DJI waypoint command $commandName timed out after ${commandTimeoutMillis}ms."
            logError(lastCommandError!!)
            false
        }
    }

    private fun normalizeErrorMessage(error: IDJIError): String {
        val description = runCatching { error.description() as String? }.getOrNull()
        if (!description.isNullOrBlank()) {
            return description
        }
        return runCatching { error.toString() }.getOrNull().takeUnless { it.isNullOrBlank() }
            ?: "DJI waypoint command failed."
    }

    companion object {
        private const val TAG = "DjiWaypointMission"
        private const val DEFAULT_WAYLINE_ID = 0
    }

    private fun sha256(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digest.joinToString(separator = "") { byte -> "%02x".format(byte) }
    }

    private fun logInfo(message: String) {
        runCatching { Log.i(TAG, message) }
    }

    private fun logWarn(message: String) {
        runCatching { Log.w(TAG, message) }
    }

    private fun logError(message: String, error: Throwable? = null) {
        runCatching {
            if (error == null) {
                Log.e(TAG, message)
            } else {
                Log.e(TAG, message, error)
            }
        }
    }

    private class RealGateway : Gateway {
        private var executeStateListener: WaypointMissionExecuteStateListener? = null
        private var waylineInfoObserver: ((String, Int, Int) -> Unit)? = null
        private var waylineInterruptObserver: ((String) -> Unit)? = null
        private var waylineExecutingInfoListener: WaylineExecutingInfoListener? = null

        override fun uploadKmz(path: String, callback: CommonCallbacks.CompletionCallbackWithProgress<Double>) {
            WaypointMissionManager.getInstance().pushKMZFileToAircraft(path, callback)
        }

        override fun startMission(missionFileName: String, callback: CommonCallbacks.CompletionCallback) {
            WaypointMissionManager.getInstance().startMission(missionFileName, callback)
        }

        override fun startMission(missionFileName: String, waylineIds: List<Int>, callback: CommonCallbacks.CompletionCallback) {
            WaypointMissionManager.getInstance().startMission(missionFileName, waylineIds, callback)
        }

        override fun pauseMission(callback: CommonCallbacks.CompletionCallback) {
            WaypointMissionManager.getInstance().pauseMission(callback)
        }

        override fun resumeMission(callback: CommonCallbacks.CompletionCallback) {
            WaypointMissionManager.getInstance().resumeMission(callback)
        }

        override fun stopMission(missionFileName: String, callback: CommonCallbacks.CompletionCallback) {
            WaypointMissionManager.getInstance().stopMission(missionFileName, callback)
        }

        override fun availableWaylineIds(missionFileName: String): List<Int> {
            return WaypointMissionManager.getInstance().getAvailableWaylineIDs(missionFileName)
        }

        override fun setExecutionStateObserver(observer: ((String) -> Unit)?) {
            executeStateListener?.let {
                WaypointMissionManager.getInstance().removeWaypointMissionExecuteStateListener(it)
            }
            executeStateListener = observer?.let { callback ->
                WaypointMissionExecuteStateListener { state ->
                    callback(state.name)
                }.also {
                    WaypointMissionManager.getInstance().addWaypointMissionExecuteStateListener(it)
                }
            }
        }

        override fun setWaylineInfoObserver(observer: ((String, Int, Int) -> Unit)?) {
            waylineInfoObserver = observer
            rebuildWaylineExecutingInfoListener()
        }

        override fun setWaylineInterruptObserver(observer: ((String) -> Unit)?) {
            waylineInterruptObserver = observer
            rebuildWaylineExecutingInfoListener()
        }

        private fun rebuildWaylineExecutingInfoListener() {
            waylineExecutingInfoListener?.let {
                WaypointMissionManager.getInstance().removeWaylineExecutingInfoListener(it)
            }
            val infoObserver = waylineInfoObserver
            val interruptObserver = waylineInterruptObserver
            if (infoObserver == null && interruptObserver == null) {
                waylineExecutingInfoListener = null
                return
            }
            waylineExecutingInfoListener = object : WaylineExecutingInfoListener {
                override fun onWaylineExecutingInfoUpdate(info: dji.v5.manager.aircraft.waypoint3.model.WaylineExecutingInfo) {
                    infoObserver?.invoke(info.missionFileName, info.waylineID, info.currentWaypointIndex)
                }

                override fun onWaylineExecutingInterruptReasonUpdate(error: IDJIError) {
                    interruptObserver?.invoke(error.description() ?: error.toString())
                }
            }.also {
                WaypointMissionManager.getInstance().addWaylineExecutingInfoListener(it)
            }
        }
    }
}

private fun String.isExecutionStartedStateName(): Boolean {
    return this in setOf(
        "ENTER_WAYLINE",
        "EXECUTING",
        "RETURN_TO_START_POINT",
        "FINISHED",
    )
}

private fun String.isStartFailureStateName(): Boolean {
    return this in setOf(
        "NOT_SUPPORTED",
        "INTERRUPTED",
        "DISCONNECTED",
    )
}
