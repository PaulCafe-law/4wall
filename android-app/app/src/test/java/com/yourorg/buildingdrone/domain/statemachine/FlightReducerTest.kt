package com.yourorg.buildingdrone.domain.statemachine

import com.yourorg.buildingdrone.domain.safety.DefaultHoldPolicy
import com.yourorg.buildingdrone.domain.safety.DefaultRthPolicy
import com.yourorg.buildingdrone.domain.safety.DefaultSafetySupervisor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FlightReducerTest {
    private val reducer = FlightReducer(
        transitionGuard = DefaultTransitionGuard(),
        safetySupervisor = DefaultSafetySupervisor(
            holdPolicy = DefaultHoldPolicy(),
            rthPolicy = DefaultRthPolicy()
        )
    )

    /*
    Happy path
    ==========
    IDLE -> PRECHECK -> MISSION_READY -> TAKEOFF -> TRANSIT
    -> BRANCH_VERIFY -> TRANSIT -> APPROACH_VIEWPOINT -> VIEW_ALIGN
    -> CAPTURE -> HOLD
    */

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
    fun missionUpload_thenTakeoffComplete_advancesToTransit() {
        val ready = FlightState(stage = FlightStage.MISSION_READY, missionBundleLoaded = true)

        val next = reducer.reduce(
            state = ready,
            event = FlightEventType.MISSION_UPLOADED,
            context = TransitionContext(
                missionBundleLoaded = true,
                missionUploaded = true,
                takeoffComplete = true
            )
        )

        assertEquals(FlightStage.TRANSIT, next.stage)
        assertEquals(true, next.missionUploaded)
    }

    @Test
    fun branchVerifyTimeout_holdsConservatively() {
        val state = FlightState(stage = FlightStage.BRANCH_VERIFY, missionUploaded = true)

        val next = reducer.reduce(state, FlightEventType.BRANCH_VERIFY_TIMEOUT)

        assertEquals(FlightStage.HOLD, next.stage)
        assertEquals("岔路驗證逾時", next.holdReason)
    }

    @Test
    fun frameStreamDrop_holdsConservatively() {
        val state = FlightState(stage = FlightStage.TRANSIT, missionUploaded = true)

        val next = reducer.reduce(
            state = state,
            event = FlightEventType.OBSTACLE_WARN,
            context = TransitionContext(
                missionUploaded = true,
                frameStreamHealthy = false
            )
        )

        assertEquals(FlightStage.HOLD, next.stage)
        assertEquals("影像串流中斷", next.holdReason)
    }

    @Test
    fun batteryCritical_forcesRthFromTransit() {
        val state = FlightState(stage = FlightStage.TRANSIT, missionUploaded = true)

        val next = reducer.reduce(state, FlightEventType.BATTERY_CRITICAL)

        assertEquals(FlightStage.RTH, next.stage)
    }

    @Test
    fun viewAlignOk_twice_reachesCapture() {
        val approach = FlightState(stage = FlightStage.APPROACH_VIEWPOINT, missionUploaded = true)
        val align = reducer.reduce(approach, FlightEventType.VIEW_ALIGN_OK, TransitionContext(missionUploaded = true))
        val capture = reducer.reduce(align, FlightEventType.VIEW_ALIGN_OK, TransitionContext(missionUploaded = true))

        assertEquals(FlightStage.VIEW_ALIGN, align.stage)
        assertEquals(FlightStage.CAPTURE, capture.stage)
    }

    @Test
    fun captureComplete_withoutRemainingViewpoints_entersHold() {
        val state = FlightState(stage = FlightStage.CAPTURE, missionUploaded = true)

        val next = reducer.reduce(
            state = state,
            event = FlightEventType.VIEW_ALIGN_OK,
            context = TransitionContext(
                missionUploaded = true,
                captureComplete = true,
                hasRemainingViewpoints = false
            )
        )

        assertEquals(FlightStage.HOLD, next.stage)
        assertEquals("拍攝完成，等待操作員決策", next.holdReason)
    }

    @Test
    fun rthArrival_thenLandingComplete_reachesCompleted() {
        val rth = FlightState(stage = FlightStage.RTH, missionUploaded = true)
        val landing = reducer.reduce(
            state = rth,
            event = FlightEventType.USER_RTH_REQUESTED,
            context = TransitionContext(rthArrived = true)
        )
        val completed = reducer.reduce(
            state = landing,
            event = FlightEventType.USER_RTH_REQUESTED,
            context = TransitionContext(landingComplete = true)
        )

        assertEquals(FlightStage.LANDING, landing.stage)
        assertEquals(FlightStage.COMPLETED, completed.stage)
        assertNull(completed.holdReason)
    }

    @Test
    fun userTakeover_alwaysWins_and_can_abort() {
        val transit = FlightState(stage = FlightStage.TRANSIT, missionUploaded = true)
        val manual = reducer.reduce(transit, FlightEventType.USER_TAKEOVER_REQUESTED)
        val aborted = reducer.reduce(
            state = manual,
            event = FlightEventType.USER_TAKEOVER_REQUESTED,
            context = TransitionContext(manualOverrideAborted = true)
        )

        assertEquals(FlightStage.MANUAL_OVERRIDE, manual.stage)
        assertEquals(FlightStage.ABORTED, aborted.stage)
    }
}
