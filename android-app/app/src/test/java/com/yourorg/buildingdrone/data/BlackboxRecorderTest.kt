package com.yourorg.buildingdrone.data

import com.yourorg.buildingdrone.dji.HardwareSnapshot
import com.yourorg.buildingdrone.dji.PerceptionSnapshot
import com.yourorg.buildingdrone.dji.SimulatorStatus
import com.yourorg.buildingdrone.domain.statemachine.FlightEventType
import com.yourorg.buildingdrone.domain.statemachine.FlightStage
import com.yourorg.buildingdrone.domain.statemachine.FlightState
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import kotlin.io.path.createTempDirectory
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertTrue
import org.junit.Test

class BlackboxRecorderTest {
    @Test
    fun exportIncident_writesStructuredReport() = runTest {
        val root = createTempDirectory(prefix = "incident-export").toFile()
        val repository = FileFlightLogRepository(root.resolve("logs"))
        val recorder = BlackboxRecorder(
            repository = repository,
            exportDirectory = root.resolve("exports"),
            clock = Clock.fixed(Instant.parse("2026-04-03T00:00:00Z"), ZoneOffset.UTC)
        )

        recorder.record(
            missionId = "mission-1",
            flightId = "flight-1",
            state = FlightState(
                stage = FlightStage.HOLD,
                lastEvent = FlightEventType.BRANCH_VERIFY_TIMEOUT,
                holdReason = "Branch confirm timeout"
            ),
            hardwareSnapshot = HardwareSnapshot(aircraftConnected = true, remoteControllerConnected = true),
            perceptionSnapshot = PerceptionSnapshot(summary = "branch uncertainty"),
            simulatorStatus = SimulatorStatus(enabled = true)
        )

        val report = recorder.exportIncident(
            missionId = "mission-1",
            flightId = "flight-1",
            stage = FlightStage.HOLD,
            reason = "Branch confirm timeout"
        )

        assertTrue(report.file.exists())
        assertTrue(report.entryCount >= 1)
        assertTrue(report.file.readText().contains("mission-1"))

        root.deleteRecursively()
    }
}
