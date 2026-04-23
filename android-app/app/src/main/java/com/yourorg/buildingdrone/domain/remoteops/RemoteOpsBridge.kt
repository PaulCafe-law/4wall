package com.yourorg.buildingdrone.domain.remoteops

import kotlinx.coroutines.flow.Flow
import java.time.Instant

/**
 * Remote ops remains non-flight-critical. Web and AnyDesk can request a higher-level action,
 * but Android bridge is still the final authority for link health, safety gating, and execution.
 */
interface RemoteOpsBridge {
    val telemetry: Flow<RemoteTelemetrySample>
    val controlLease: Flow<ControlLeaseSnapshot>
    val videoChannel: Flow<VideoChannelState>
    val alerts: Flow<BridgeAlert>

    suspend fun acquireLease(request: LeaseAcquireRequest): ControlLeaseAck
    suspend fun releaseLease(request: LeaseReleaseRequest): ControlLeaseAck
    suspend fun setRemoteControlEnabled(request: RemoteControlToggleRequest): ControlLeaseAck
    suspend fun submitHighLevelIntent(intent: HighLevelControlIntent): ControlIntentAck
    suspend fun triggerEmergencyHold(reason: String): ControlIntentAck
    suspend fun triggerReturnToHome(reason: String): ControlIntentAck
}

data class RemoteTelemetrySample(
    val observedAt: Instant,
    val lat: Double,
    val lng: Double,
    val altitudeM: Double,
    val groundSpeedMps: Double,
    val batteryPct: Int,
    val headingDeg: Double?,
    val flightState: String,
    val corridorDeviationM: Double,
    val uplinkHealthy: Boolean,
)

data class ControlLeaseSnapshot(
    val holder: LeaseHolder,
    val mode: ControlMode,
    val remoteControlEnabled: Boolean,
    val observerReady: Boolean,
    val heartbeatHealthy: Boolean,
    val expiresAt: Instant?,
    val lastUpdatedAt: Instant,
)

data class VideoChannelState(
    val available: Boolean,
    val streaming: Boolean,
    val viewerUrl: String?,
    val codec: String?,
    val latencyMs: Int?,
    val lastFrameAt: Instant?,
)

data class BridgeAlert(
    val severity: AlertSeverity,
    val code: String,
    val summary: String,
    val observedAt: Instant,
)

data class LeaseAcquireRequest(
    val requestedBy: String,
    val source: LeaseSource,
    val observerConfirmed: Boolean,
    val requestedAt: Instant,
)

data class LeaseReleaseRequest(
    val requestedBy: String,
    val source: LeaseSource,
    val requestedAt: Instant,
)

data class RemoteControlToggleRequest(
    val requestedBy: String,
    val enabled: Boolean,
    val requestedAt: Instant,
)

data class HighLevelControlIntent(
    val action: ControlAction,
    val reason: String,
    val requestedBy: String,
    val source: LeaseSource,
    val requestedAt: Instant,
)

data class ControlLeaseAck(
    val accepted: Boolean,
    val reason: String,
    val snapshot: ControlLeaseSnapshot,
)

data class ControlIntentAck(
    val accepted: Boolean,
    val reason: String,
    val action: ControlAction,
    val decidedAt: Instant,
)

enum class LeaseHolder {
    SITE_CONTROL_STATION,
    HQ_REMOTE_OPERATOR,
    RC_PILOT,
    RELEASED,
}

enum class LeaseSource {
    LOCAL_STATION,
    HQ_REMOTE_DESKTOP,
    RC,
    FAILSAFE,
}

enum class ControlMode {
    MONITOR_ONLY,
    REMOTE_CONTROL_REQUESTED,
    REMOTE_CONTROL_ACTIVE,
    RELEASED,
}

enum class ControlAction {
    REQUEST_REMOTE_CONTROL,
    RELEASE_REMOTE_CONTROL,
    PAUSE_MISSION,
    RESUME_MISSION,
    HOLD,
    RETURN_TO_HOME,
}

enum class AlertSeverity {
    INFO,
    WARNING,
    CRITICAL,
}
