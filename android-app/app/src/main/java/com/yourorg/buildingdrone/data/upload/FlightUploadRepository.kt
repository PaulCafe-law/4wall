package com.yourorg.buildingdrone.data.upload

import com.yourorg.buildingdrone.data.network.FlightEventUploadWire
import com.yourorg.buildingdrone.data.network.FlightEventsRequestWire
import com.yourorg.buildingdrone.data.network.PlannerAuthException
import com.yourorg.buildingdrone.data.network.PlannerGateway
import com.yourorg.buildingdrone.data.network.TelemetryBatchRequestWire
import com.yourorg.buildingdrone.data.network.TelemetrySampleWire
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.io.IOException
import java.util.UUID

data class UploadBacklogSnapshot(
    val pendingEventUploads: Int,
    val pendingTelemetryUploads: Int,
    val authValid: Boolean,
    val statusNote: String?
)

interface FlightUploadRepository {
    suspend fun enqueueFlightEvent(
        flightId: String,
        missionId: String,
        eventType: String,
        payload: Map<String, String>
    ): UploadBacklogSnapshot

    suspend fun enqueueTelemetryBatch(
        flightId: String,
        missionId: String,
        samples: List<TelemetrySampleWire>
    ): UploadBacklogSnapshot

    suspend fun flush(): UploadBacklogSnapshot
    suspend fun snapshot(): UploadBacklogSnapshot
}

class FileFlightUploadRepository(
    private val plannerApi: PlannerGateway,
    rootDirectory: File,
    private val json: Json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
) : FlightUploadRepository {
    private val mutex = Mutex()
    private val queueFile = File(rootDirectory, "upload-backlog.json")

    init {
        rootDirectory.mkdirs()
    }

    override suspend fun enqueueFlightEvent(
        flightId: String,
        missionId: String,
        eventType: String,
        payload: Map<String, String>
    ): UploadBacklogSnapshot = withContext(Dispatchers.IO) {
        mutex.withLock {
            val current = readStore()
            val updated = current.copy(
                pendingEvents = current.pendingEvents + PendingFlightEvent(
                    flightId = flightId,
                    missionId = missionId,
                    event = FlightEventUploadWire(
                        eventId = "evt_${UUID.randomUUID()}",
                        type = eventType,
                        timestamp = java.time.Instant.now().toString(),
                        payload = payload
                    )
                )
            )
            writeStore(updated)
            flushLocked()
        }
    }

    override suspend fun enqueueTelemetryBatch(
        flightId: String,
        missionId: String,
        samples: List<TelemetrySampleWire>
    ): UploadBacklogSnapshot = withContext(Dispatchers.IO) {
        mutex.withLock {
            val current = readStore()
            val updated = current.copy(
                pendingTelemetry = current.pendingTelemetry + PendingTelemetryBatch(
                    flightId = flightId,
                    missionId = missionId,
                    samples = samples
                )
            )
            writeStore(updated)
            flushLocked()
        }
    }

    override suspend fun flush(): UploadBacklogSnapshot = withContext(Dispatchers.IO) {
        mutex.withLock {
            flushLocked()
        }
    }

    override suspend fun snapshot(): UploadBacklogSnapshot = withContext(Dispatchers.IO) {
        mutex.withLock {
            readStore().toSnapshot(authValid = true, statusNote = null)
        }
    }

    private suspend fun flushLocked(): UploadBacklogSnapshot {
        var authValid = true
        var statusNote: String? = null
        var store = readStore()

        val retainedEvents = mutableListOf<PendingFlightEvent>()
        val groupedEvents = store.pendingEvents.groupBy { "${it.flightId}:${it.missionId}" }
        for ((groupKey, items) in groupedEvents) {
            val first = items.first()
            try {
                plannerApi.uploadFlightEvents(
                    flightId = first.flightId,
                    request = FlightEventsRequestWire(
                        missionId = first.missionId,
                        events = items.map { it.event }
                    )
                )
            } catch (error: PlannerAuthException) {
                authValid = false
                statusNote = "Server authentication expired. Event uploads are queued locally."
                retainedEvents += items
                retainRemainingEvents(groupKey, groupedEvents, retainedEvents)
                break
            } catch (_: IOException) {
                statusNote = "Event upload failed. Pending uploads will retry later."
                retainedEvents += items
                retainRemainingEvents(groupKey, groupedEvents, retainedEvents)
                break
            }
        }

        val processedEventKeys = retainedEvents.map { "${it.flightId}:${it.missionId}" }.toSet()
        if (processedEventKeys.isEmpty()) {
            store = store.copy(pendingEvents = emptyList())
        } else {
            store = store.copy(
                pendingEvents = store.pendingEvents.filter { "${it.flightId}:${it.missionId}" in processedEventKeys }
            )
        }

        val retainedTelemetry = mutableListOf<PendingTelemetryBatch>()
        for (batch in store.pendingTelemetry) {
            try {
                plannerApi.uploadTelemetryBatch(
                    flightId = batch.flightId,
                    request = TelemetryBatchRequestWire(
                        missionId = batch.missionId,
                        samples = batch.samples
                    )
                )
            } catch (error: PlannerAuthException) {
                authValid = false
                statusNote = "Server authentication expired. Telemetry uploads are queued locally."
                retainedTelemetry += batch
                retainedTelemetry += store.pendingTelemetry.dropWhile { it !== batch }.drop(1)
                break
            } catch (_: IOException) {
                statusNote = "Telemetry upload failed. Pending uploads will retry later."
                retainedTelemetry += batch
                retainedTelemetry += store.pendingTelemetry.dropWhile { it !== batch }.drop(1)
                break
            }
        }

        store = store.copy(pendingTelemetry = retainedTelemetry)
        writeStore(store)
        return store.toSnapshot(authValid = authValid, statusNote = statusNote)
    }

    private fun retainRemainingEvents(
        currentGroupKey: String,
        groupedEvents: Map<String, List<PendingFlightEvent>>,
        retainedEvents: MutableList<PendingFlightEvent>
    ) {
        var keep = false
        for ((groupKey, items) in groupedEvents) {
            if (groupKey == currentGroupKey) {
                keep = true
                continue
            }
            if (keep) {
                retainedEvents += items
            }
        }
    }

    private fun readStore(): PendingUploadStore {
        if (!queueFile.exists()) {
            return PendingUploadStore()
        }
        return try {
            json.decodeFromString(PendingUploadStore.serializer(), queueFile.readText(Charsets.UTF_8))
        } catch (_: Exception) {
            PendingUploadStore()
        }
    }

    private fun writeStore(store: PendingUploadStore) {
        queueFile.parentFile?.mkdirs()
        queueFile.writeText(
            text = json.encodeToString(PendingUploadStore.serializer(), store),
            charset = Charsets.UTF_8
        )
    }
}

@Serializable
private data class PendingFlightEvent(
    val flightId: String,
    val missionId: String,
    val event: FlightEventUploadWire
)

@Serializable
private data class PendingTelemetryBatch(
    val flightId: String,
    val missionId: String,
    val samples: List<TelemetrySampleWire>
)

@Serializable
private data class PendingUploadStore(
    val pendingEvents: List<PendingFlightEvent> = emptyList(),
    val pendingTelemetry: List<PendingTelemetryBatch> = emptyList()
) {
    fun toSnapshot(authValid: Boolean, statusNote: String?): UploadBacklogSnapshot {
        return UploadBacklogSnapshot(
            pendingEventUploads = pendingEvents.size,
            pendingTelemetryUploads = pendingTelemetry.size,
            authValid = authValid,
            statusNote = statusNote
        )
    }
}
