package com.yourorg.buildingdrone.data

import com.yourorg.buildingdrone.core.GeoPoint
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
    val schemaMajor: Int = 1,
    val missionMetaPresent: Boolean = true,
    val missionKmzPresent: Boolean = true,
    val missionMetaChecksumVerified: Boolean = true,
    val missionKmzChecksumVerified: Boolean = true
) {
    val isComplete: Boolean
        get() = missionMetaPresent && missionKmzPresent

    val isVerified: Boolean
        get() = schemaMajor == 1 && missionMetaChecksumVerified && missionKmzChecksumVerified
}

data class MissionBundle(
    val missionId: String,
    val routeMode: String,
    val corridorSegments: List<CorridorSegment>,
    val verificationPoints: List<VerificationPoint>,
    val inspectionViewpoints: List<InspectionViewpoint>,
    val defaultAltitudeMeters: Double,
    val defaultSpeedMetersPerSecond: Double,
    val bundleVersion: String = "1.0.0",
    val artifacts: MissionArtifacts = demoMissionArtifacts(),
    val verification: MissionBundleVerification = MissionBundleVerification(),
    val failsafe: MissionFailsafe = MissionFailsafe()
) {
    init {
        require(missionId.isNotBlank()) { "missionId must not be blank" }
        require(routeMode.isNotBlank()) { "routeMode must not be blank" }
        require(corridorSegments.isNotEmpty()) { "corridorSegments must not be empty" }
        require(defaultAltitudeMeters > 0.0) { "defaultAltitudeMeters must be positive" }
        require(defaultSpeedMetersPerSecond > 0.0) { "defaultSpeedMetersPerSecond must be positive" }
        require(bundleVersion.isNotBlank()) { "bundleVersion must not be blank" }
    }

    fun isArtifactComplete(): Boolean = artifacts.hasLocalPaths() && verification.isComplete

    fun isVerified(): Boolean = isArtifactComplete() && verification.isVerified
}

fun demoMissionArtifacts(): MissionArtifacts = MissionArtifacts(
    missionKmz = MissionArtifact(
        name = "mission.kmz",
        localPath = "embedded://demo-mission.kmz",
        checksum = "sha256:demo-kmz",
        version = 1
    ),
    missionMeta = MissionArtifact(
        name = "mission_meta.json",
        localPath = "embedded://demo-mission-meta.json",
        checksum = "sha256:demo-meta",
        version = 1
    )
)

fun demoMissionBundle(): MissionBundle = MissionBundle(
    missionId = "demo-mission-001",
    routeMode = "road_network_following",
    corridorSegments = listOf(
        CorridorSegment(
            segmentId = "seg-001",
            polyline = listOf(
                GeoPoint(25.03391, 121.56452),
                GeoPoint(25.03402, 121.56464)
            ),
            halfWidthMeters = 8.0,
            suggestedAltitudeMeters = 35.0,
            suggestedSpeedMetersPerSecond = 4.0
        )
    ),
    verificationPoints = listOf(
        VerificationPoint(
            verificationPointId = "vp-branch-001",
            location = GeoPoint(25.03412, 121.56472),
            expectedOptions = setOf(BranchDecision.LEFT, BranchDecision.STRAIGHT),
            timeoutMillis = 2_500L
        )
    ),
    inspectionViewpoints = listOf(
        InspectionViewpoint(
            inspectionViewpointId = "inspect-001",
            location = GeoPoint(25.03441, 121.56501),
            yawDegrees = 225.0,
            captureMode = "photo_burst",
            label = "north-east-facade"
        )
    ),
    defaultAltitudeMeters = 35.0,
    defaultSpeedMetersPerSecond = 4.0
)
