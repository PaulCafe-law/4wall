package com.yourorg.buildingdrone.data

import com.yourorg.buildingdrone.dji.HardwareSnapshot
import com.yourorg.buildingdrone.dji.PerceptionSnapshot
import com.yourorg.buildingdrone.dji.SimulatorStatus
import com.yourorg.buildingdrone.domain.statemachine.FlightStage
import com.yourorg.buildingdrone.domain.statemachine.FlightState
import java.io.File
import java.nio.charset.StandardCharsets
import java.time.Clock
import java.time.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class FileFlightLogRepository(
    private val rootDirectory: File
) : FlightLogRepository {
    private val logFile = File(rootDirectory, "blackbox-log.jsonl")

    override suspend fun append(event: String) {
        withContext(Dispatchers.IO) {
            rootDirectory.mkdirs()
            logFile.appendText(event + System.lineSeparator(), StandardCharsets.UTF_8)
        }
    }

    override suspend fun readAll(): List<String> {
        return withContext(Dispatchers.IO) {
            if (!logFile.exists()) {
                emptyList()
            } else {
                logFile.readLines(StandardCharsets.UTF_8).filter { it.isNotBlank() }
            }
        }
    }
}

@Serializable
data class BlackboxEntry(
    val timestamp: String,
    val missionId: String? = null,
    val flightId: String? = null,
    val stage: String,
    val lastEvent: String? = null,
    val holdReason: String? = null,
    val statusNote: String? = null,
    val aircraftConnected: Boolean,
    val remoteControllerConnected: Boolean,
    val gpsReady: Boolean,
    val simulatorEnabled: Boolean,
    val perceptionSummary: String? = null
)

@Serializable
data class IncidentReport(
    val exportedAt: String,
    val missionId: String? = null,
    val flightId: String? = null,
    val reason: String,
    val stage: String,
    val entryCount: Int,
    val entries: List<BlackboxEntry>
)

data class IncidentExportResult(
    val file: File,
    val entryCount: Int
)

class BlackboxRecorder(
    private val repository: FlightLogRepository,
    private val exportDirectory: File,
    private val clock: Clock = Clock.systemUTC(),
    private val exportJson: Json = Json { prettyPrint = true; ignoreUnknownKeys = true }
) {
    private val lineJson: Json = Json { prettyPrint = false; ignoreUnknownKeys = true }

    suspend fun record(
        missionId: String?,
        flightId: String?,
        state: FlightState,
        hardwareSnapshot: HardwareSnapshot,
        perceptionSnapshot: PerceptionSnapshot,
        simulatorStatus: SimulatorStatus
    ) {
        val entry = BlackboxEntry(
            timestamp = Instant.now(clock).toString(),
            missionId = missionId,
            flightId = flightId,
            stage = state.stage.name,
            lastEvent = state.lastEvent?.name,
            holdReason = state.holdReason,
            statusNote = state.statusNote,
            aircraftConnected = hardwareSnapshot.aircraftConnected,
            remoteControllerConnected = hardwareSnapshot.remoteControllerConnected,
            gpsReady = hardwareSnapshot.gpsReady,
            simulatorEnabled = simulatorStatus.enabled,
            perceptionSummary = perceptionSnapshot.summary
        )
        repository.append(lineJson.encodeToString(entry))
    }

    suspend fun exportIncident(
        missionId: String?,
        flightId: String?,
        stage: FlightStage,
        reason: String
    ): IncidentExportResult {
        val entries = repository.readAll().mapNotNull { line ->
            runCatching { lineJson.decodeFromString<BlackboxEntry>(line) }.getOrNull()
        }
        val report = IncidentReport(
            exportedAt = Instant.now(clock).toString(),
            missionId = missionId,
            flightId = flightId,
            reason = reason,
            stage = stage.name,
            entryCount = entries.size,
            entries = entries
        )
        val target = withContext(Dispatchers.IO) {
            exportDirectory.mkdirs()
            val file = File(exportDirectory, "incident-${stage.name.lowercase()}-${Instant.now(clock).epochSecond}.json")
            file.writeText(exportJson.encodeToString(report), StandardCharsets.UTF_8)
            file
        }
        return IncidentExportResult(file = target, entryCount = report.entryCount)
    }
}
