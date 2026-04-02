package com.yourorg.buildingdrone.domain.safety

import com.yourorg.buildingdrone.domain.statemachine.FlightEventType
import org.junit.Assert.assertEquals
import org.junit.Test

class SafetySupervisorTest {
    private val supervisor = DefaultSafetySupervisor(
        holdPolicy = DefaultHoldPolicy(),
        rthPolicy = DefaultRthPolicy()
    )

    @Test
    fun batteryCritical_escalatesToRth() {
        assertEquals(
            SafetyDecision.RTH,
            supervisor.evaluate(FlightEventType.BATTERY_CRITICAL, SafetySnapshot())
        )
    }

    @Test
    fun branchVerifyTimeout_escalatesToHold() {
        assertEquals(
            SafetyDecision.HOLD,
            supervisor.evaluate(FlightEventType.BRANCH_VERIFY_TIMEOUT, SafetySnapshot())
        )
    }

    @Test
    fun frameStreamDrop_escalatesToHold() {
        assertEquals(
            SafetyDecision.HOLD,
            supervisor.evaluate(
                FlightEventType.FRAME_STREAM_DROPPED,
                SafetySnapshot(frameStreamHealthy = false)
            )
        )
    }

    @Test
    fun appHealthBad_escalatesToHold() {
        assertEquals(
            SafetyDecision.HOLD,
            supervisor.evaluate(
                FlightEventType.APP_HEALTH_BAD,
                SafetySnapshot(appHealthy = false)
            )
        )
    }

    @Test
    fun gpsWeak_escalatesToHold() {
        assertEquals(
            SafetyDecision.HOLD,
            supervisor.evaluate(
                FlightEventType.GPS_WEAK,
                SafetySnapshot(gpsWeak = true)
            )
        )
    }

    @Test
    fun rcSignalLost_escalatesToHold() {
        assertEquals(
            SafetyDecision.HOLD,
            supervisor.evaluate(
                FlightEventType.RC_SIGNAL_LOST,
                SafetySnapshot(rcSignalHealthy = false)
            )
        )
    }
}
