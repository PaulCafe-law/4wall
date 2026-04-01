package com.yourorg.buildingdrone.domain.statemachine

import com.yourorg.buildingdrone.domain.safety.DefaultHoldPolicy
import com.yourorg.buildingdrone.domain.safety.DefaultRthPolicy
import com.yourorg.buildingdrone.domain.safety.DefaultSafetySupervisor
import org.junit.Assert.assertEquals
import org.junit.Test

class FlightReducerTest {
    private val reducer = FlightReducer(
        transitionGuard = DefaultTransitionGuard(),
        safetySupervisor = DefaultSafetySupervisor(
            holdPolicy = DefaultHoldPolicy(),
            rthPolicy = DefaultRthPolicy()
        )
    )

    @Test
    fun missionSelected_movesIdleToPrecheck() {
        val next = reducer.reduce(FlightState(), FlightEventType.MISSION_SELECTED)

        assertEquals(FlightStage.PRECHECK, next.stage)
    }

    @Test
    fun preflightOk_withoutMissionBundle_staysInPrecheck() {
        val state = FlightState(stage = FlightStage.PRECHECK)

        val next = reducer.reduce(state, FlightEventType.PREFLIGHT_OK)

        assertEquals(FlightStage.PRECHECK, next.stage)
    }

    @Test
    fun batteryCritical_forcesRthFromTransit() {
        val state = FlightState(stage = FlightStage.TRANSIT, missionUploaded = true)

        val next = reducer.reduce(state, FlightEventType.BATTERY_CRITICAL)

        assertEquals(FlightStage.RTH, next.stage)
    }

    @Test
    fun userTakeover_alwaysWins() {
        val state = FlightState(stage = FlightStage.TRANSIT, missionUploaded = true)

        val next = reducer.reduce(state, FlightEventType.USER_TAKEOVER_REQUESTED)

        assertEquals(FlightStage.MANUAL_OVERRIDE, next.stage)
    }
}
