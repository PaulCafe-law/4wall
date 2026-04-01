package com.yourorg.buildingdrone.data

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

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
}
