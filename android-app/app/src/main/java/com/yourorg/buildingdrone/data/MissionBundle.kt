package com.yourorg.buildingdrone.data

import com.yourorg.buildingdrone.core.GeoPoint
import com.yourorg.buildingdrone.domain.operations.OperationProfile
import com.yourorg.buildingdrone.domain.semantic.BranchDecision

data class CorridorSegment(
    val segmentId: String,
    val polyline: List<GeoPoint>,
    val halfWidthMeters: Double,
    val suggestedAltitudeMeters: Double,
    val suggestedSpeedMetersPerSecond: Double
) {
    init {
        require(segmentId.isNotBlank()) { "segmentId must not be blank" }
        require(polyline.size >= 2) { "corridor segment requires at least 2 points" }
        require(halfWidthMeters > 0.0) { "halfWidthMeters must be positive" }
    }
}

data class VerificationPoint(
    val verificationPointId: String,
    val location: GeoPoint,
    val expectedOptions: Set<BranchDecision>,
    val timeoutMillis: Long
) {
    init {
        require(verificationPointId.isNotBlank()) { "verificationPointId must not be blank" }
        require(expectedOptions.isNotEmpty()) { "expectedOptions must not be empty" }
        require(timeoutMillis > 0L) { "timeoutMillis must be positive" }
    }
}

data class InspectionViewpoint(
    val inspectionViewpointId: String,
    val location: GeoPoint,
    val yawDegrees: Double,
    val captureMode: String,
    val label: String
) {
    init {
        require(inspectionViewpointId.isNotBlank()) { "inspectionViewpointId must not be blank" }
        require(captureMode.isNotBlank()) { "captureMode must not be blank" }
    }
}

data class RouteLaunchPoint(
    val label: String = "L",
    val location: GeoPoint
) {
    init {
        require(label.isNotBlank()) { "launchPoint label must not be blank" }
    }
}

data class OrderedWaypoint(
    val waypointId: String,
    val sequence: Int,
    val location: GeoPoint,
    val altitudeMeters: Double? = null,
    val speedMetersPerSecond: Double? = null,
    val holdSeconds: Double = 0.0
) {
    init {
        require(waypointId.isNotBlank()) { "waypointId must not be blank" }
        require(sequence > 0) { "sequence must be positive" }
        require(holdSeconds >= 0.0) { "holdSeconds must not be negative" }
        altitudeMeters?.let { require(it > 0.0) { "altitudeMeters must be positive" } }
        speedMetersPerSecond?.let { require(it > 0.0) { "speedMetersPerSecond must be positive" } }
    }
}

data class MissionFailsafe(
    val onSemanticTimeout: String = "HOLD",
    val onBatteryCritical: String = "RTH",
    val onFrameDrop: String = "HOLD"
)

data class MissionArtifact(
    val name: String,
    val localPath: String,
    val checksum: String,
    val version: Int,
    val sizeBytes: Long = 0L
) {
    init {
        require(name.isNotBlank()) { "artifact name must not be blank" }
        require(localPath.isNotBlank()) { "artifact localPath must not be blank" }
        require(checksum.isNotBlank()) { "artifact checksum must not be blank" }
        require(version > 0) { "artifact version must be positive" }
        require(sizeBytes >= 0L) { "artifact sizeBytes must not be negative" }
    }

    fun isEmbedded(): Boolean = localPath.startsWith("embedded://")
}

data class MissionArtifacts(
    val missionKmz: MissionArtifact,
    val missionMeta: MissionArtifact
) {
    fun hasLocalPaths(): Boolean = missionKmz.localPath.isNotBlank() && missionMeta.localPath.isNotBlank()
}

data class MissionBundleVerification(
    val schemaMajor: Int = 2,
    val missionMetaPresent: Boolean = true,
    val missionKmzPresent: Boolean = true,
    val missionMetaChecksumVerified: Boolean = true,
    val missionKmzChecksumVerified: Boolean = true
) {
    val isComplete: Boolean
        get() = missionMetaPresent && missionKmzPresent

    val isVerified: Boolean
        get() = schemaMajor >= 2 && missionMetaChecksumVerified && missionKmzChecksumVerified
}

data class MissionBundle(
    val missionId: String,
    val routeMode: String,
    val operatingProfile: OperationProfile = OperationProfile.OUTDOOR_GPS_REQUIRED,
    val launchPoint: RouteLaunchPoint,
    val orderedWaypoints: List<OrderedWaypoint>,
    val implicitReturnToLaunch: Boolean = true,
    val defaultAltitudeMeters: Double,
    val defaultSpeedMetersPerSecond: Double,
    val bundleVersion: String = "2.0.0",
    val artifacts: MissionArtifacts = demoMissionArtifacts(),
    val verification: MissionBundleVerification = MissionBundleVerification(),
    val failsafe: MissionFailsafe = MissionFailsafe(),
    val legacyCorridorSegments: List<CorridorSegment> = emptyList(),
    val legacyVerificationPoints: List<VerificationPoint> = emptyList(),
    val legacyInspectionViewpoints: List<InspectionViewpoint> = emptyList()
) {
    init {
        require(missionId.isNotBlank()) { "missionId must not be blank" }
        require(routeMode.isNotBlank()) { "routeMode must not be blank" }
        require(orderedWaypoints.isNotEmpty()) { "orderedWaypoints must not be empty" }
        require(implicitReturnToLaunch) { "patrol route must return to launch" }
        require(defaultAltitudeMeters > 0.0) { "defaultAltitudeMeters must be positive" }
        require(defaultSpeedMetersPerSecond > 0.0) { "defaultSpeedMetersPerSecond must be positive" }
        require(bundleVersion.isNotBlank()) { "bundleVersion must not be blank" }
        require(orderedWaypoints.map { it.sequence } == (1..orderedWaypoints.size).toList()) {
            "orderedWaypoints sequence must be contiguous starting at 1"
        }
    }

    fun isArtifactComplete(): Boolean = artifacts.hasLocalPaths() && verification.isComplete

    fun isVerified(): Boolean = isArtifactComplete() && verification.isVerified

    fun closedLoopPath(): List<GeoPoint> = buildList {
        add(launchPoint.location)
        addAll(orderedWaypoints.sortedBy { it.sequence }.map { it.location })
        add(launchPoint.location)
    }
}

fun demoMissionArtifacts(): MissionArtifacts = MissionArtifacts(
    missionKmz = MissionArtifact(
        name = "mission.kmz",
        localPath = "embedded://demo-mission.kmz",
        checksum = "sha256:demo-kmz",
        version = 2
    ),
    missionMeta = MissionArtifact(
        name = "mission_meta.json",
        localPath = "embedded://demo-mission-meta.json",
        checksum = "sha256:demo-meta",
        version = 2
    )
)

fun demoMissionBundle(): MissionBundle = MissionBundle(
    missionId = "demo-mission-001",
    routeMode = "road_network_following",
    operatingProfile = OperationProfile.OUTDOOR_GPS_REQUIRED,
    launchPoint = RouteLaunchPoint(
        location = GeoPoint(25.03391, 121.56452)
    ),
    orderedWaypoints = listOf(
        OrderedWaypoint(
            waypointId = "wp-001",
            sequence = 1,
            location = GeoPoint(25.03402, 121.56464),
            altitudeMeters = 35.0,
            speedMetersPerSecond = 4.0
        ),
        OrderedWaypoint(
            waypointId = "wp-002",
            sequence = 2,
            location = GeoPoint(25.03426, 121.56491),
            altitudeMeters = 35.0,
            speedMetersPerSecond = 4.0
        )
    ),
    implicitReturnToLaunch = true,
    defaultAltitudeMeters = 35.0,
    defaultSpeedMetersPerSecond = 4.0
)
