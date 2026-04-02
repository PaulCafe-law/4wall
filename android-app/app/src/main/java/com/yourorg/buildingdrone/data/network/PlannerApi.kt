package com.yourorg.buildingdrone.data.network

import com.yourorg.buildingdrone.data.auth.plannerJson
import kotlinx.serialization.SerializationException
import java.io.IOException

data class DownloadedArtifact(
    val bytes: ByteArray,
    val checksumHeader: String?,
    val versionHeader: Int?
)

interface PlannerGateway {
    suspend fun planMission(request: MissionPlanRequestWire): MissionPlanResponseWire
    suspend fun downloadArtifact(pathOrUrl: String): DownloadedArtifact
    suspend fun uploadFlightEvents(flightId: String, request: FlightEventsRequestWire): FlightEventsAcceptedWire
    suspend fun uploadTelemetryBatch(flightId: String, request: TelemetryBatchRequestWire): TelemetryBatchAcceptedWire
}

class PlannerApi(
    private val authenticatedTransport: PlannerTransport,
    private val json: kotlinx.serialization.json.Json = plannerJson
) : PlannerGateway {
    override suspend fun planMission(request: MissionPlanRequestWire): MissionPlanResponseWire {
        val response = authenticatedTransport.postJson(
            pathOrUrl = "/v1/missions/plan",
            body = json.encodeToString(MissionPlanRequestWire.serializer(), request),
            authenticated = true
        )
        return decode(response.body, MissionPlanResponseWire.serializer())
    }

    override suspend fun downloadArtifact(pathOrUrl: String): DownloadedArtifact {
        val response = authenticatedTransport.get(pathOrUrl, authenticated = true)
        return DownloadedArtifact(
            bytes = response.body,
            checksumHeader = response.headers["X-Artifact-Checksum"] ?: response.headers["x-artifact-checksum"],
            versionHeader = response.headers["X-Artifact-Version"]?.toIntOrNull()
                ?: response.headers["x-artifact-version"]?.toIntOrNull()
        )
    }

    override suspend fun uploadFlightEvents(
        flightId: String,
        request: FlightEventsRequestWire
    ): FlightEventsAcceptedWire {
        val response = authenticatedTransport.postJson(
            pathOrUrl = "/v1/flights/$flightId/events",
            body = json.encodeToString(FlightEventsRequestWire.serializer(), request),
            authenticated = true
        )
        return decode(response.body, FlightEventsAcceptedWire.serializer())
    }

    override suspend fun uploadTelemetryBatch(
        flightId: String,
        request: TelemetryBatchRequestWire
    ): TelemetryBatchAcceptedWire {
        val response = authenticatedTransport.postJson(
            pathOrUrl = "/v1/flights/$flightId/telemetry:batch",
            body = json.encodeToString(TelemetryBatchRequestWire.serializer(), request),
            authenticated = true
        )
        return decode(response.body, TelemetryBatchAcceptedWire.serializer())
    }

    private fun <T> decode(
        payload: ByteArray,
        serializer: kotlinx.serialization.KSerializer<T>
    ): T {
        return try {
            json.decodeFromString(serializer, payload.toString(Charsets.UTF_8))
        } catch (error: SerializationException) {
            throw IOException("invalid_planner_payload", error)
        }
    }
}
