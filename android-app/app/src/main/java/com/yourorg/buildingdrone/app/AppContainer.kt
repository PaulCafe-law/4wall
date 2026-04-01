package com.yourorg.buildingdrone.app

import com.yourorg.buildingdrone.data.FakeMissionRepository
import com.yourorg.buildingdrone.data.InMemoryFlightLogRepository
import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.data.demoMissionBundle
import com.yourorg.buildingdrone.dji.FakeCameraStreamAdapter
import com.yourorg.buildingdrone.dji.FakePerceptionAdapter
import com.yourorg.buildingdrone.dji.FakeVirtualStickAdapter
import com.yourorg.buildingdrone.dji.FakeWaypointMissionAdapter
import com.yourorg.buildingdrone.domain.safety.DefaultHoldPolicy
import com.yourorg.buildingdrone.domain.safety.DefaultRthPolicy
import com.yourorg.buildingdrone.domain.safety.DefaultSafetySupervisor
import com.yourorg.buildingdrone.domain.statemachine.DefaultTransitionGuard
import com.yourorg.buildingdrone.domain.statemachine.FlightReducer

class AppContainer(
    missionBundle: MissionBundle = demoMissionBundle()
) {
    val missionRepository = FakeMissionRepository(missionBundle)
    val flightLogRepository = InMemoryFlightLogRepository()
    val waypointMissionAdapter = FakeWaypointMissionAdapter()
    val virtualStickAdapter = FakeVirtualStickAdapter()
    val cameraStreamAdapter = FakeCameraStreamAdapter()
    val perceptionAdapter = FakePerceptionAdapter()

    private val holdPolicy = DefaultHoldPolicy()
    private val rthPolicy = DefaultRthPolicy()

    val safetySupervisor = DefaultSafetySupervisor(
        holdPolicy = holdPolicy,
        rthPolicy = rthPolicy
    )
    val flightReducer = FlightReducer(
        transitionGuard = DefaultTransitionGuard(),
        safetySupervisor = safetySupervisor
    )
}
