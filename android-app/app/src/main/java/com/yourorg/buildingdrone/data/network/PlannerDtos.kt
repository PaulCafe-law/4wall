package com.yourorg.buildingdrone.data.network

import kotlinx.serialization.Serializable

@Serializable
data class GeoPointWire(
    val lat: Double,
    val lng: Double
)

@Serializable
data class LaunchPointWire(
    val launchPointId: String,
    val label: String = "L",
    val location: GeoPointWire
)

@Serializable
data class OrderedWaypointWire(
    val waypointId: String,
    val sequence: Int,
    val location: GeoPointWire,
    val altitudeMeters: Double? = null,
    val speedMetersPerSecond: Double? = null,
    val holdSeconds: Double = 0.0
)

@Serializable
data class FlightProfileWire(
    val defaultAltitudeM: Double,
    val defaultSpeedMps: Double,
    val maxApproachSpeedMps: Double
)

@Serializable
data class MissionPlanRequestWire(
    val missionName: String,
    val launchPoint: LaunchPointWire,
    val orderedWaypoints: List<OrderedWaypointWire>,
    val implicitReturnToLaunch: Boolean = true,
    val routingMode: String,
    val flightProfile: FlightProfileWire,
    val operatingProfile: String = "outdoor_gps_patrol",
    val demoMode: Boolean
)

@Serializable
data class MissionFailsafeWire(
    val onSemanticTimeout: String = "HOLD",
    val onBatteryCritical: String = "RTH",
    val onFrameDrop: String = "HOLD"
)

@Serializable
data class MissionBundleWire(
    val missionId: String,
    val routeMode: String,
    val operatingProfile: String,
    val launchPoint: LaunchPointWire,
    val orderedWaypoints: List<OrderedWaypointWire>,
    val implicitReturnToLaunch: Boolean,
    val defaultAltitudeMeters: Double,
    val defaultSpeedMetersPerSecond: Double,
    val bundleVersion: String = "2.0.0",
    val failsafe: MissionFailsafeWire = MissionFailsafeWire()
)

@Serializable
data class MissionArtifactDescriptorWire(
    val downloadUrl: String,
    val version: Int,
    val checksumSha256: String,
    val contentType: String,
    val sizeBytes: Long,
    val cacheControl: String
)

@Serializable
data class MissionArtifactsWire(
    val missionKmz: MissionArtifactDescriptorWire,
    val missionMeta: MissionArtifactDescriptorWire
)

@Serializable
data class MissionPlanResponseWire(
    val missionId: String,
    val bundleVersion: String,
    val missionBundle: MissionBundleWire,
    val artifacts: MissionArtifactsWire
)

@Serializable
data class MissionMetaWire(
    val missionId: String,
    val bundleVersion: String,
    val generatedAt: String,
    val routeMode: String,
    val operatingProfile: String,
    val launchPoint: LaunchPointWire,
    val waypointCount: Int,
    val implicitReturnToLaunch: Boolean,
    val defaultAltitudeMeters: Double,
    val defaultSpeedMetersPerSecond: Double,
    val landingPolicy: String,
    val safetyDefaults: MissionFailsafeWire,
    val artifacts: MissionArtifactsWire
)

@Serializable
data class LoginRequestWire(
    val username: String,
    val password: String
)

@Serializable
data class RefreshRequestWire(
    val refreshToken: String
)

@Serializable
data class LogoutRequestWire(
    val refreshToken: String
)

@Serializable
data class OperatorWire(
    val operatorId: String,
    val username: String,
    val displayName: String
)

@Serializable
data class TokenPairWire(
    val accessToken: String,
    val refreshToken: String,
    val tokenType: String,
    val expiresInSeconds: Int,
    val operator: OperatorWire
)

@Serializable
data class FlightEventUploadWire(
    val eventId: String,
    val type: String,
    val timestamp: String,
    val payload: Map<String, String>
)

@Serializable
data class FlightEventsRequestWire(
    val missionId: String,
    val events: List<FlightEventUploadWire>
)

@Serializable
data class TelemetrySampleWire(
    val timestamp: String,
    val lat: Double,
    val lng: Double,
    val altitudeM: Double,
    val groundSpeedMps: Double,
    val batteryPct: Int,
    val flightState: String,
    val corridorDeviationM: Double
)

@Serializable
data class TelemetryBatchRequestWire(
    val missionId: String,
    val samples: List<TelemetrySampleWire>
)

@Serializable
data class FlightEventsAcceptedWire(
    val accepted: Int,
    val rejected: Int
)

@Serializable
data class TelemetryBatchAcceptedWire(
    val accepted: Int
)

@Serializable
data class CachedMissionRecord(
    val missionId: String,
    val flightId: String,
    val bundleVersion: String,
    val missionBundle: MissionBundleWire,
    val missionKmz: MissionArtifactDescriptorWire,
    val missionMeta: MissionArtifactDescriptorWire,
    val missionKmzPath: String,
    val missionMetaPath: String
)
