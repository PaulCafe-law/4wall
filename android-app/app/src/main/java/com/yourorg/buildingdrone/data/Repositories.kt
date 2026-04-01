package com.yourorg.buildingdrone.data

interface MissionRepository {
    suspend fun loadMissionBundle(): MissionBundle
}

interface FlightLogRepository {
    suspend fun append(event: String)
    suspend fun readAll(): List<String>
}

class FakeMissionRepository(
    private val missionBundle: MissionBundle
) : MissionRepository {
    override suspend fun loadMissionBundle(): MissionBundle = missionBundle
}

class InMemoryFlightLogRepository : FlightLogRepository {
    private val events = mutableListOf<String>()

    override suspend fun append(event: String) {
        events += event
    }

    override suspend fun readAll(): List<String> = events.toList()
}
