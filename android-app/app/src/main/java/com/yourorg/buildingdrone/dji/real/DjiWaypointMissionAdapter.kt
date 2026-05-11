package com.yourorg.buildingdrone.dji.real

import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.dji.MissionExecutionState
import com.yourorg.buildingdrone.dji.MissionLoadRequest
import com.yourorg.buildingdrone.dji.MissionLoadStatus
import com.yourorg.buildingdrone.dji.WaypointMissionAdapter
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.v5.manager.aircraft.waypoint3.WaypointMissionManager
import java.io.File
import java.util.zip.ZipFile
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

class DjiWaypointMissionAdapter(
    private val gateway: Gateway = RealGateway()
) : WaypointMissionAdapter {
    interface Gateway {
        fun uploadKmz(path: String, callback: CommonCallbacks.CompletionCallbackWithProgress<Double>)
        fun startMission(missionId: String, waylineIds: List<Int>, callback: CommonCallbacks.CompletionCallback)
        fun pauseMission(callback: CommonCallbacks.CompletionCallback)
        fun resumeMission(callback: CommonCallbacks.CompletionCallback)
        fun stopMission(missionId: String, callback: CommonCallbacks.CompletionCallback)
        fun availableWaylineIds(kmzPath: String): List<Int>
    }

    private var loadedMission: MissionLoadStatus? = null
    private var loadedMissionPath: String? = null
    private var loadedMissionId: String? = null
    private var executionState = MissionExecutionState.IDLE
    private var lastCommandError: String? = null
    private var uploadProgressPercent: Int? = null

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
        lastCommandError = loadedMission?.error
        executionState = if (loadedMission?.valid == true) MissionExecutionState.LOADED else MissionExecutionState.FAILED
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
        val uploaded = suspendCoroutine { continuation ->
            gateway.uploadKmz(kmzPath, object : CommonCallbacks.CompletionCallbackWithProgress<Double> {
                override fun onProgressUpdate(progress: Double) {
                    uploadProgressPercent = progress.asPercent()
                }

                override fun onSuccess() {
                    uploadProgressPercent = 100
                    lastCommandError = null
                    continuation.resume(true)
                }

                override fun onFailure(error: IDJIError) {
                    lastCommandError = error.toString()
                    continuation.resume(false)
                }
            })
        }
        executionState = if (uploaded) MissionExecutionState.UPLOADED else MissionExecutionState.FAILED
        return uploaded
    }

    override suspend fun startMission(): Boolean {
        if (executionState !in setOf(MissionExecutionState.UPLOADED, MissionExecutionState.PAUSED)) {
            lastCommandError = "Mission is not uploaded."
            return false
        }
        val missionId = loadedMissionId ?: run {
            lastCommandError = "No loaded mission ID."
            return false
        }
        val missionPath = loadedMissionPath ?: run {
            lastCommandError = "No loaded mission path."
            return false
        }
        val waylineIds = gateway.availableWaylineIds(missionPath)
        val started = suspendCompletion { gateway.startMission(missionId, waylineIds, it) }
        executionState = if (started) MissionExecutionState.RUNNING else MissionExecutionState.FAILED
        return started
    }

    override suspend fun pauseMission(): Boolean {
        val paused = suspendCompletion { gateway.pauseMission(it) }
        executionState = if (paused) MissionExecutionState.PAUSED else executionState
        return paused
    }

    override suspend fun resumeMission(): Boolean {
        val resumed = suspendCompletion { gateway.resumeMission(it) }
        executionState = if (resumed) MissionExecutionState.RUNNING else executionState
        return resumed
    }

    override suspend fun stopMission(): Boolean {
        val missionId = loadedMissionId ?: run {
            lastCommandError = "No loaded mission ID."
            return false
        }
        val stopped = suspendCompletion { gateway.stopMission(missionId, it) }
        executionState = if (stopped) MissionExecutionState.STOPPED else executionState
        return stopped
    }

    override fun executionState(): MissionExecutionState = executionState

    override fun lastLoadedMission(): MissionLoadStatus? = loadedMission

    override fun uploadProgressPercent(): Int? = uploadProgressPercent

    override fun lastCommandError(): String? = lastCommandError

    private fun Double.asPercent(): Int {
        val normalized = if (this <= 1.0) this * 100.0 else this
        return normalized.coerceIn(0.0, 100.0).toInt()
    }

    private suspend fun suspendCompletion(
        block: (CommonCallbacks.CompletionCallback) -> Unit
    ): Boolean = suspendCoroutine { continuation ->
        block(object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
                lastCommandError = null
                continuation.resume(true)
            }

            override fun onFailure(error: IDJIError) {
                lastCommandError = error.toString()
                continuation.resume(false)
            }
        })
    }

    private class RealGateway : Gateway {
        override fun uploadKmz(path: String, callback: CommonCallbacks.CompletionCallbackWithProgress<Double>) {
            WaypointMissionManager.getInstance().pushKMZFileToAircraft(path, callback)
        }

        override fun startMission(missionId: String, waylineIds: List<Int>, callback: CommonCallbacks.CompletionCallback) {
            WaypointMissionManager.getInstance().startMission(missionId, waylineIds, callback)
        }

        override fun pauseMission(callback: CommonCallbacks.CompletionCallback) {
            WaypointMissionManager.getInstance().pauseMission(callback)
        }

        override fun resumeMission(callback: CommonCallbacks.CompletionCallback) {
            WaypointMissionManager.getInstance().resumeMission(callback)
        }

        override fun stopMission(missionId: String, callback: CommonCallbacks.CompletionCallback) {
            WaypointMissionManager.getInstance().stopMission(missionId, callback)
        }

        override fun availableWaylineIds(kmzPath: String): List<Int> {
            return WaypointMissionManager.getInstance().getAvailableWaylineIDs(kmzPath)
        }
    }
}
