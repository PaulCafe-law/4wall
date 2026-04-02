package com.yourorg.buildingdrone.data.sync

import com.yourorg.buildingdrone.data.MissionSyncResult
import com.yourorg.buildingdrone.data.auth.plannerJson
import com.yourorg.buildingdrone.data.network.CorridorSegmentWire
import com.yourorg.buildingdrone.data.network.DownloadedArtifact
import com.yourorg.buildingdrone.data.network.FakePlannerGateway
import com.yourorg.buildingdrone.data.network.GeoPointWire
import com.yourorg.buildingdrone.data.network.InspectionViewpointWire
import com.yourorg.buildingdrone.data.network.MissionArtifactDescriptorWire
import com.yourorg.buildingdrone.data.network.MissionArtifactsWire
import com.yourorg.buildingdrone.data.network.MissionBundleWire
import com.yourorg.buildingdrone.data.network.MissionFailsafeWire
import com.yourorg.buildingdrone.data.network.MissionMetaWire
import com.yourorg.buildingdrone.data.network.MissionPlanRequestWire
import com.yourorg.buildingdrone.data.network.MissionPlanResponseWire
import com.yourorg.buildingdrone.data.network.VerificationPointWire
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.security.MessageDigest
import kotlin.io.path.createTempDirectory

class ServerMissionRepositoryTest {
    @Test
    fun syncMissionBundle_downloadsAndCachesVerifiedBundle() = runTest {
        val gateway = FakePlannerGateway()
        val fixture = missionFixture("msn-001")
        gateway.planMissionHandler = { fixture.response }
        gateway.downloadArtifactHandler = { path ->
            when {
                path.endsWith("mission.kmz") -> fixture.kmz
                path.endsWith("mission_meta.json") -> fixture.meta
                else -> error("Unexpected path $path")
            }
        }
        val repository = ServerMissionRepository(
            plannerApi = gateway,
            rootDirectory = createTempDirectory(prefix = "mission-sync").toFile(),
            planRequestFactory = ::defaultRequest
        )

        val result = repository.syncMissionBundle()
        val flightContext = repository.loadActiveFlightContext()

        assertTrue(result is MissionSyncResult.Success)
        val bundle = repository.loadMissionBundle()
        assertNotNull(bundle)
        assertEquals("msn-001", bundle?.missionId)
        assertTrue(bundle?.isVerified() == true)
        assertEquals("msn-001", flightContext?.missionId)
        assertTrue(flightContext?.flightId?.startsWith("flt_") == true)
        assertTrue(File(bundle!!.artifacts.missionKmz.localPath).exists())
        assertTrue(File(bundle.artifacts.missionMeta.localPath).exists())
    }

    @Test
    fun syncMissionBundle_checksumFailure_preservesPreviousVerifiedCache() = runTest {
        val gateway = FakePlannerGateway()
        val firstFixture = missionFixture("msn-001")
        gateway.planMissionHandler = { firstFixture.response }
        gateway.downloadArtifactHandler = { path ->
            when {
                path.endsWith("mission.kmz") -> firstFixture.kmz
                path.endsWith("mission_meta.json") -> firstFixture.meta
                else -> error("Unexpected path $path")
            }
        }
        val root = createTempDirectory(prefix = "mission-sync").toFile()
        val repository = ServerMissionRepository(
            plannerApi = gateway,
            rootDirectory = root,
            planRequestFactory = ::defaultRequest
        )
        repository.syncMissionBundle()

        val corruptFixture = missionFixture("msn-002")
        gateway.planMissionHandler = { corruptFixture.response }
        gateway.downloadArtifactHandler = { path ->
            when {
                path.endsWith("mission.kmz") -> corruptFixture.kmz
                path.endsWith("mission_meta.json") -> corruptFixture.meta.copy(bytes = "corrupted".toByteArray())
                else -> error("Unexpected path $path")
            }
        }

        val failed = repository.syncMissionBundle()
        val cached = repository.loadMissionBundle()

        assertTrue(failed is MissionSyncResult.Failure)
        assertEquals("msn-001", cached?.missionId)
        assertTrue(cached?.isVerified() == true)
    }

    @Test
    fun loadMissionBundle_revalidatesCachedChecksumsOnRead() = runTest {
        val gateway = FakePlannerGateway()
        val fixture = missionFixture("msn-003")
        gateway.planMissionHandler = { fixture.response }
        gateway.downloadArtifactHandler = { path ->
            when {
                path.endsWith("mission.kmz") -> fixture.kmz
                path.endsWith("mission_meta.json") -> fixture.meta
                else -> error("Unexpected path $path")
            }
        }
        val root = createTempDirectory(prefix = "mission-sync").toFile()
        val repository = ServerMissionRepository(
            plannerApi = gateway,
            rootDirectory = root,
            planRequestFactory = ::defaultRequest
        )
        repository.syncMissionBundle()

        val cachedBeforeCorruption = repository.loadMissionBundle()
        File(cachedBeforeCorruption!!.artifacts.missionKmz.localPath).writeText("tampered")

        val reloaded = repository.loadMissionBundle()

        assertTrue(reloaded != null)
        assertTrue(reloaded?.verification?.missionKmzChecksumVerified == false)
        assertTrue(reloaded?.isVerified() == false)
    }

    private fun missionFixture(missionId: String): MissionFixture {
        val kmzBytes = "kmz-$missionId".toByteArray()
        val kmzChecksum = sha256(kmzBytes)
        val missionBundle = MissionBundleWire(
            missionId = missionId,
            routeMode = "road_network_following",
            defaultAltitudeMeters = 35.0,
            defaultSpeedMetersPerSecond = 4.0,
            corridorSegments = listOf(
                CorridorSegmentWire(
                    segmentId = "seg-001",
                    polyline = listOf(
                        GeoPointWire(lat = 25.03391, lng = 121.56452),
                        GeoPointWire(lat = 25.03402, lng = 121.56464)
                    ),
                    halfWidthMeters = 8.0,
                    suggestedAltitudeMeters = 35.0,
                    suggestedSpeedMetersPerSecond = 4.0
                )
            ),
            verificationPoints = listOf(
                VerificationPointWire(
                    verificationPointId = "vp-001",
                    location = GeoPointWire(lat = 25.03412, lng = 121.56472),
                    expectedOptions = listOf("LEFT", "STRAIGHT"),
                    timeoutMillis = 2500L
                )
            ),
            inspectionViewpoints = listOf(
                InspectionViewpointWire(
                    inspectionViewpointId = "inspect-001",
                    location = GeoPointWire(lat = 25.03441, lng = 121.56501),
                    yawDegrees = 225.0,
                    captureMode = "photo_burst",
                    label = "north-east-facade"
                )
            ),
            failsafe = MissionFailsafeWire()
        )
        val missionMetaTemplate = MissionMetaWire(
            missionId = missionId,
            bundleVersion = "1.0.0",
            generatedAt = "2026-04-02T10:00:00Z",
            segments = 1,
            verificationPoints = 1,
            inspectionViewpoints = 1,
            corridorHalfWidthM = 8.0,
            suggestedAltitudeM = 35.0,
            suggestedSpeedMps = 4.0,
            safetyDefaults = MissionFailsafeWire(),
            artifacts = MissionArtifactsWire(
                missionKmz = MissionArtifactDescriptorWire(
                    downloadUrl = "/v1/missions/$missionId/artifacts/mission.kmz",
                    version = 1,
                    checksumSha256 = kmzChecksum,
                    contentType = "application/vnd.google-earth.kmz",
                    sizeBytes = kmzBytes.size.toLong(),
                    cacheControl = "private, max-age=300"
                ),
                missionMeta = MissionArtifactDescriptorWire(
                    downloadUrl = "/v1/missions/$missionId/artifacts/mission_meta.json",
                    version = 1,
                    checksumSha256 = "published-via-header",
                    contentType = "application/json",
                    sizeBytes = 0,
                    cacheControl = "private, max-age=300"
                )
            )
        )
        val metaBytes = plannerJson.encodeToString(MissionMetaWire.serializer(), missionMetaTemplate).toByteArray()
        val metaChecksum = sha256(metaBytes)
        val response = MissionPlanResponseWire(
            missionId = missionId,
            bundleVersion = "1.0.0",
            missionBundle = missionBundle,
            artifacts = MissionArtifactsWire(
                missionKmz = missionMetaTemplate.artifacts.missionKmz,
                missionMeta = missionMetaTemplate.artifacts.missionMeta.copy(
                    checksumSha256 = metaChecksum,
                    sizeBytes = metaBytes.size.toLong()
                )
            )
        )
        return MissionFixture(
            response = response,
            kmz = DownloadedArtifact(
                bytes = kmzBytes,
                checksumHeader = kmzChecksum,
                versionHeader = 1
            ),
            meta = DownloadedArtifact(
                bytes = metaBytes,
                checksumHeader = metaChecksum,
                versionHeader = 1
            )
        )
    }

    private fun defaultRequest(): MissionPlanRequestWire {
        return MissionPlanRequestWire(
            missionName = "test",
            origin = GeoPointWire(25.0, 121.0),
            targetBuilding = com.yourorg.buildingdrone.data.network.TargetBuildingWire("bldg", "Building"),
            routingMode = "road_network_following",
            corridorPolicy = com.yourorg.buildingdrone.data.network.CorridorPolicyWire(8.0, 12.0, 10.0),
            flightProfile = com.yourorg.buildingdrone.data.network.FlightProfileWire(35.0, 4.0, 2.0),
            inspectionIntent = com.yourorg.buildingdrone.data.network.InspectionIntentWire(
                viewpoints = listOf(
                    com.yourorg.buildingdrone.data.network.InspectionViewpointRequestWire(
                        viewpointId = "vp-001",
                        label = "north-east-facade",
                        lat = 25.03441,
                        lng = 121.56501,
                        yawDeg = 225.0,
                        distanceToFacadeM = 12.0
                    )
                )
            ),
            demoMode = false
        )
    }

    private fun sha256(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digest.joinToString(separator = "") { byte -> "%02x".format(byte) }
    }

    private data class MissionFixture(
        val response: MissionPlanResponseWire,
        val kmz: DownloadedArtifact,
        val meta: DownloadedArtifact
    )
}
