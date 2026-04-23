package com.yourorg.buildingdrone.data.network

class FakePlannerGateway : PlannerGateway {
    var planMissionHandler: suspend (MissionPlanRequestWire) -> MissionPlanResponseWire =
        { error("planMissionHandler not set") }
    var downloadArtifactHandler: suspend (String) -> DownloadedArtifact =
        { error("downloadArtifactHandler not set") }
    var uploadFlightEventsHandler: suspend (String, FlightEventsRequestWire) -> FlightEventsAcceptedWire =
        { _, _ -> FlightEventsAcceptedWire(accepted = 0, rejected = 0) }
    var uploadTelemetryBatchHandler: suspend (String, TelemetryBatchRequestWire) -> TelemetryBatchAcceptedWire =
        { _, _ -> TelemetryBatchAcceptedWire(accepted = 0) }

    val uploadedEvents = mutableListOf<Pair<String, FlightEventsRequestWire>>()
    val uploadedTelemetry = mutableListOf<Pair<String, TelemetryBatchRequestWire>>()

    override suspend fun planMission(request: MissionPlanRequestWire): MissionPlanResponseWire {
        return planMissionHandler(request)
    }

    override suspend fun downloadArtifact(pathOrUrl: String): DownloadedArtifact {
        return downloadArtifactHandler(pathOrUrl)
    }

    override suspend fun uploadFlightEvents(
        flightId: String,
        request: FlightEventsRequestWire
    ): FlightEventsAcceptedWire {
        uploadedEvents += flightId to request
        return uploadFlightEventsHandler(flightId, request)
    }

    override suspend fun uploadTelemetryBatch(
        flightId: String,
        request: TelemetryBatchRequestWire
    ): TelemetryBatchAcceptedWire {
        uploadedTelemetry += flightId to request
        return uploadTelemetryBatchHandler(flightId, request)
    }
}
