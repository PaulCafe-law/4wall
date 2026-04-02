package com.yourorg.buildingdrone.data.upload

import com.yourorg.buildingdrone.data.network.FakePlannerGateway
import com.yourorg.buildingdrone.data.network.PlannerAuthException
import com.yourorg.buildingdrone.data.network.TelemetrySampleWire
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.io.path.createTempDirectory

class FlightUploadRepositoryTest {
    @Test
    fun enqueueFlightEvent_flushesImmediatelyWhenAuthIsHealthy() = runTest {
        val gateway = FakePlannerGateway()
        val repository = FileFlightUploadRepository(
            plannerApi = gateway,
            rootDirectory = createTempDirectory(prefix = "upload-backlog").toFile()
        )

        val snapshot = repository.enqueueFlightEvent(
            flightId = "flt-001",
            missionId = "msn-001",
            eventType = "MISSION_UPLOADED",
            payload = mapOf("stage" to "TAKEOFF")
        )

        assertEquals(0, snapshot.pendingEventUploads)
        assertEquals(0, snapshot.pendingTelemetryUploads)
        assertTrue(snapshot.authValid)
        assertEquals(1, gateway.uploadedEvents.size)
        assertEquals("flt-001", gateway.uploadedEvents.single().first)
    }

    @Test
    fun authFailure_keepsUploadsQueuedForLater() = runTest {
        val gateway = FakePlannerGateway().apply {
            uploadFlightEventsHandler = { _, _ -> throw PlannerAuthException("expired") }
        }
        val repository = FileFlightUploadRepository(
            plannerApi = gateway,
            rootDirectory = createTempDirectory(prefix = "upload-backlog").toFile()
        )

        val snapshot = repository.enqueueFlightEvent(
            flightId = "flt-001",
            missionId = "msn-001",
            eventType = "MISSION_UPLOADED",
            payload = mapOf("stage" to "TAKEOFF")
        )

        assertEquals(1, snapshot.pendingEventUploads)
        assertFalse(snapshot.authValid)
        assertEquals(1, gateway.uploadedEvents.size)
    }

    @Test
    fun telemetryBatch_flushesAndClearsBacklog() = runTest {
        val gateway = FakePlannerGateway()
        val repository = FileFlightUploadRepository(
            plannerApi = gateway,
            rootDirectory = createTempDirectory(prefix = "upload-backlog").toFile()
        )

        val snapshot = repository.enqueueTelemetryBatch(
            flightId = "flt-001",
            missionId = "msn-001",
            samples = listOf(
                TelemetrySampleWire(
                    timestamp = "2026-04-02T10:00:00Z",
                    lat = 25.0341,
                    lng = 121.5647,
                    altitudeM = 34.6,
                    groundSpeedMps = 3.8,
                    batteryPct = 78,
                    flightState = "TRANSIT",
                    corridorDeviationM = 1.2
                )
            )
        )

        assertEquals(0, snapshot.pendingTelemetryUploads)
        assertEquals(1, gateway.uploadedTelemetry.size)
    }
}
