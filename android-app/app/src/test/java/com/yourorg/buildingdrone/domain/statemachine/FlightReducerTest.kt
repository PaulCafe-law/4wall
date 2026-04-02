package com.yourorg.buildingdrone.domain.statemachine

import com.yourorg.buildingdrone.domain.safety.DefaultHoldPolicy
import com.yourorg.buildingdrone.domain.safety.DefaultRthPolicy
import com.yourorg.buildingdrone.domain.safety.DefaultSafetySupervisor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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

    @Test
    fun missionSelected_movesIdleToPrecheck() {
        val next = reducer.reduce(FlightState(), FlightEventType.MISSION_SELECTED)

        assertEquals(FlightStage.PRECHECK, next.stage)
    }

    @Test
    fun preflightOk_withoutVerifiedMissionBundle_staysInPrecheck() {
        val state = FlightState(stage = FlightStage.PRECHECK, missionBundleLoaded = true)

        val next = reducer.reduce(state, FlightEventType.PREFLIGHT_OK)

        assertEquals(FlightStage.PRECHECK, next.stage)
        assertFalse(next.preflightReady)
    }

    @Test
    fun verifiedBundle_thenPreflightOk_entersMissionReady() {
        val state = FlightState(stage = FlightStage.PRECHECK, missionBundleLoaded = true, missionBundleVerified = true)

        val next = reducer.reduce(
            state,
            FlightEventType.PREFLIGHT_OK,
            TransitionContext(
                missionBundleLoaded = true,
                missionBundleVerified = true,
                preflightReady = true
            )
        )

        assertEquals(FlightStage.MISSION_READY, next.stage)
        assertEquals(true, next.preflightReady)
    }

    @Test
    fun missionUpload_thenTakeoffComplete_advancesToTransit() {
        val ready = FlightState(
            stage = FlightStage.MISSION_READY,
            missionBundleLoaded = true,
            missionBundleVerified = true,
            preflightReady = true
        )

        val next = reducer.reduce(
            state = ready,
            event = FlightEventType.MISSION_UPLOADED,
            context = TransitionContext(
                missionBundleLoaded = true,
                missionBundleVerified = true,
                preflightReady = true,
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
        assertEquals("Branch confirm 逾時", next.holdReason)
    }

    @Test
    fun frameStreamDrop_holdsConservatively() {
        val state = FlightState(stage = FlightStage.TRANSIT, missionUploaded = true)

        val next = reducer.reduce(
            state = state,
            event = FlightEventType.FRAME_STREAM_DROPPED,
            context = TransitionContext(
                missionUploaded = true,
                frameStreamHealthy = false
            )
        )

        assertEquals(FlightStage.HOLD, next.stage)
        assertEquals("相機 frame stream 已中斷", next.holdReason)
    }

    @Test
    fun batteryCritical_forcesRthFromTransit() {
        val state = FlightState(stage = FlightStage.TRANSIT, missionUploaded = true)

        val next = reducer.reduce(state, FlightEventType.BATTERY_CRITICAL)

        assertEquals(FlightStage.RTH, next.stage)
    }

    @Test
    fun gpsWeak_holdsConservatively() {
        val state = FlightState(stage = FlightStage.TRANSIT, missionUploaded = true)

        val next = reducer.reduce(
            state = state,
            event = FlightEventType.GPS_WEAK,
            context = TransitionContext(
                missionUploaded = true,
                gpsWeak = true
            )
        )

        assertEquals(FlightStage.HOLD, next.stage)
        assertEquals("GPS 訊號偏弱，先停住等待", next.holdReason)
    }

    @Test
    fun rcSignalLost_holdsConservatively() {
        val state = FlightState(stage = FlightStage.TRANSIT, missionUploaded = true)

        val next = reducer.reduce(
            state = state,
            event = FlightEventType.RC_SIGNAL_LOST,
            context = TransitionContext(
                missionUploaded = true,
                rcSignalHealthy = false
            )
        )

        assertEquals(FlightStage.HOLD, next.stage)
        assertEquals("遙控訊號中斷", next.holdReason)
    }

    @Test
    fun hold_resume_returnsToLastAutonomousStage() {
        val hold = FlightState(
            stage = FlightStage.HOLD,
            missionUploaded = true,
            lastAutonomousStage = FlightStage.TRANSIT
        )

        val next = reducer.reduce(hold, FlightEventType.USER_RESUME_REQUESTED, TransitionContext(missionUploaded = true))

        assertEquals(FlightStage.TRANSIT, next.stage)
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
    fun authExpiry_doesNotChangeFlightStage() {
        val state = FlightState(stage = FlightStage.TRANSIT, missionUploaded = true, authValid = true)

        val next = reducer.reduce(
            state = state,
            event = FlightEventType.AUTH_EXPIRED,
            context = TransitionContext(
                authValid = false,
                pendingEventUploads = 2,
                pendingTelemetryUploads = 1
            )
        )

        assertEquals(FlightStage.TRANSIT, next.stage)
        assertFalse(next.authValid)
        assertEquals(2, next.pendingEventUploads)
        assertEquals(1, next.pendingTelemetryUploads)
    }

    @Test
    fun backlogUpdate_updatesPendingCountsWithoutBreakingFlight() {
        val state = FlightState(stage = FlightStage.TRANSIT, missionUploaded = true)

        val next = reducer.reduce(
            state = state,
            event = FlightEventType.UPLOAD_BACKLOG_UPDATED,
            context = TransitionContext(
                authValid = true,
                pendingEventUploads = 3,
                pendingTelemetryUploads = 2
            )
        )

        assertEquals(FlightStage.TRANSIT, next.stage)
        assertEquals(3, next.pendingEventUploads)
        assertEquals(2, next.pendingTelemetryUploads)
        assertEquals("上傳已先記錄在本機，稍後會自動重試。", next.statusNote)
    }
}
