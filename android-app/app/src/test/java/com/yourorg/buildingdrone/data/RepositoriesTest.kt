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
    fun flightLogRepository_appendsEventsInOrder() = runTest {
        val repository = InMemoryFlightLogRepository()

        repository.append("MISSION_SELECTED")
        repository.append("MISSION_UPLOADED")

        assertEquals(listOf("MISSION_SELECTED", "MISSION_UPLOADED"), repository.readAll())
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
