package com.yourorg.buildingdrone.data

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.io.path.createTempDirectory

class RepositoriesTest {
    @Test
    fun fakeMissionRepository_returnsConfiguredBundle() = runTest {
        val expected = demoMissionBundle()
        val repository = FakeMissionRepository(expected)

        assertEquals(expected, repository.loadMissionBundle())
    }

    @Test
    fun fakeMissionRepository_clearCachedMissionBundle_removesBundle() = runTest {
        val repository = FakeMissionRepository(demoMissionBundle())

        repository.clearCachedMissionBundle()

        assertEquals(null, repository.loadMissionBundle())
    }

    @Test
    fun flightLogRepository_appendsEventsInOrder() = runTest {
        val repository = InMemoryFlightLogRepository()

        repository.append("MISSION_SELECTED")
        repository.append("MISSION_UPLOADED")

        assertEquals(listOf("MISSION_SELECTED", "MISSION_UPLOADED"), repository.readAll())
    }

    @Test
    fun fileFlightLogRepository_persistsJsonLines() = runTest {
        val root = createTempDirectory(prefix = "blackbox-log").toFile()
        val repository = FileFlightLogRepository(root)

        repository.append("{\"event\":\"MISSION_SELECTED\"}")
        repository.append("{\"event\":\"MISSION_UPLOADED\"}")

        assertEquals(
            listOf("{\"event\":\"MISSION_SELECTED\"}", "{\"event\":\"MISSION_UPLOADED\"}"),
            repository.readAll()
        )

        root.deleteRecursively()
    }

    @Test
    fun seedMissionBundle_writesLocalArtifacts() {
        val root = createTempDirectory(prefix = "mission-seed").toFile()

        val seeded = seedMissionBundle(root)

        assertTrue(File(seeded.artifacts.missionKmz.localPath).exists())
        assertTrue(File(seeded.artifacts.missionMeta.localPath).exists())
        assertTrue(seeded.isVerified())

        root.deleteRecursively()
    }
}
