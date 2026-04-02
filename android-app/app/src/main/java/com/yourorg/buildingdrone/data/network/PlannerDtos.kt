package com.yourorg.buildingdrone.data.network

import kotlinx.serialization.Serializable

@Serializable
data class GeoPointWire(
    val lat: Double,
    val lng: Double
)

@Serializable
data class TargetBuildingWire(
    val buildingId: String,
    val label: String
)

@Serializable
data class CorridorPolicyWire(
    val defaultHalfWidthM: Double,
    val maxHalfWidthM: Double,
    val branchConfirmRadiusM: Double
)

@Serializable
data class FlightProfileWire(
    val defaultAltitudeM: Double,
    val defaultSpeedMps: Double,
    val maxApproachSpeedMps: Double
)

@Serializable
data class InspectionViewpointRequestWire(
    val viewpointId: String,
    val label: String,
    val lat: Double,
    val lng: Double,
    val yawDeg: Double,
    val distanceToFacadeM: Double
)

@Serializable
data class InspectionIntentWire(
    val viewpoints: List<InspectionViewpointRequestWire>
)

@Serializable
data class MissionPlanRequestWire(
    val missionName: String,
    val origin: GeoPointWire,
    val targetBuilding: TargetBuildingWire,
    val routingMode: String,
    val corridorPolicy: CorridorPolicyWire,
    val flightProfile: FlightProfileWire,
    val inspectionIntent: InspectionIntentWire,
    val demoMode: Boolean
)

@Serializable
data class CorridorSegmentWire(
    val segmentId: String,
    val polyline: List<GeoPointWire>,
    val halfWidthMeters: Double,
    val suggestedAltitudeMeters: Double,
    val suggestedSpeedMetersPerSecond: Double
)

@Serializable
data class VerificationPointWire(
    val verificationPointId: String,
    val location: GeoPointWire,
    val expectedOptions: List<String>,
    val timeoutMillis: Long
)

@Serializable
data class InspectionViewpointWire(
    val inspectionViewpointId: String,
    val location: GeoPointWire,
    val yawDegrees: Double,
    val captureMode: String,
    val label: String
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
    val defaultAltitudeMeters: Double,
    val defaultSpeedMetersPerSecond: Double,
    val corridorSegments: List<CorridorSegmentWire>,
    val verificationPoints: List<VerificationPointWire>,
    val inspectionViewpoints: List<InspectionViewpointWire>,
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
    val segments: Int,
    val verificationPoints: Int,
    val inspectionViewpoints: Int,
    val corridorHalfWidthM: Double,
    val suggestedAltitudeM: Double,
    val suggestedSpeedMps: Double,
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
