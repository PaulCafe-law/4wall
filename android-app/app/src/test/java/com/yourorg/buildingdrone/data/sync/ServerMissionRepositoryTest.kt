package com.yourorg.buildingdrone.data.sync

import com.yourorg.buildingdrone.data.MissionSyncResult
import com.yourorg.buildingdrone.data.auth.plannerJson
import com.yourorg.buildingdrone.data.network.DownloadedArtifact
import com.yourorg.buildingdrone.data.network.FakePlannerGateway
import com.yourorg.buildingdrone.data.network.FlightProfileWire
import com.yourorg.buildingdrone.data.network.GeoPointWire
import com.yourorg.buildingdrone.data.network.LaunchPointWire
import com.yourorg.buildingdrone.data.network.MissionArtifactDescriptorWire
import com.yourorg.buildingdrone.data.network.MissionArtifactsWire
import com.yourorg.buildingdrone.data.network.MissionBundleWire
import com.yourorg.buildingdrone.data.network.MissionFailsafeWire
import com.yourorg.buildingdrone.data.network.MissionMetaWire
import com.yourorg.buildingdrone.data.network.MissionPlanRequestWire
import com.yourorg.buildingdrone.data.network.MissionPlanResponseWire
import com.yourorg.buildingdrone.data.network.OrderedWaypointWire
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
        assertEquals("outdoor_gps_patrol", bundle?.operatingProfile?.wireName)
        assertEquals(2, bundle?.orderedWaypoints?.size)
        assertTrue(bundle?.implicitReturnToLaunch == true)
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

    @Test
    fun clearCachedMissionBundle_removesActiveBundleAndFlightContext() = runTest {
        val gateway = FakePlannerGateway()
        val fixture = missionFixture("msn-004")
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
        repository.syncMissionBundle()

        repository.clearCachedMissionBundle()

        assertEquals(null, repository.loadMissionBundle())
        assertEquals(null, repository.loadActiveFlightContext())
    }

    private fun missionFixture(missionId: String): MissionFixture {
        val kmzBytes = "kmz-$missionId".toByteArray()
        val kmzChecksum = sha256(kmzBytes)
        val launchPoint = LaunchPointWire(
            launchPointId = "launch-01",
            label = "L",
            location = GeoPointWire(
                lat = 25.03391,
                lng = 121.56452
            )
        )
        val orderedWaypoints = listOf(
            OrderedWaypointWire(
                waypointId = "wp-001",
                sequence = 1,
                location = GeoPointWire(
                    lat = 25.03412,
                    lng = 121.56472
                ),
                altitudeMeters = 35.0,
                speedMetersPerSecond = 4.0
            ),
            OrderedWaypointWire(
                waypointId = "wp-002",
                sequence = 2,
                location = GeoPointWire(
                    lat = 25.03441,
                    lng = 121.56501
                ),
                altitudeMeters = 35.0,
                speedMetersPerSecond = 4.0
            )
        )
        val missionBundle = MissionBundleWire(
            missionId = missionId,
            routeMode = "road_network_following",
            operatingProfile = "outdoor_gps_patrol",
            launchPoint = launchPoint,
            orderedWaypoints = orderedWaypoints,
            implicitReturnToLaunch = true,
            defaultAltitudeMeters = 35.0,
            defaultSpeedMetersPerSecond = 4.0,
            failsafe = MissionFailsafeWire()
        )
        val missionMetaTemplate = MissionMetaWire(
            missionId = missionId,
            bundleVersion = "2.0.0",
            generatedAt = "2026-04-02T10:00:00Z",
            routeMode = "road_network_following",
            operatingProfile = "outdoor_gps_patrol",
            launchPoint = launchPoint,
            waypointCount = orderedWaypoints.size,
            implicitReturnToLaunch = true,
            defaultAltitudeMeters = 35.0,
            defaultSpeedMetersPerSecond = 4.0,
            landingPolicy = "android_auto_landing_with_rc_fallback",
            safetyDefaults = MissionFailsafeWire(),
            artifacts = MissionArtifactsWire(
                missionKmz = MissionArtifactDescriptorWire(
                    downloadUrl = "/v1/missions/$missionId/artifacts/mission.kmz",
                    version = 2,
                    checksumSha256 = kmzChecksum,
                    contentType = "application/vnd.google-earth.kmz",
                    sizeBytes = kmzBytes.size.toLong(),
                    cacheControl = "private, max-age=300"
                ),
                missionMeta = MissionArtifactDescriptorWire(
                    downloadUrl = "/v1/missions/$missionId/artifacts/mission_meta.json",
                    version = 2,
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
            bundleVersion = "2.0.0",
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
                versionHeader = 2
            ),
            meta = DownloadedArtifact(
                bytes = metaBytes,
                checksumHeader = metaChecksum,
                versionHeader = 2
            )
        )
    }

    private fun defaultRequest(): MissionPlanRequestWire {
        return MissionPlanRequestWire(
            missionName = "test",
            launchPoint = LaunchPointWire(
                launchPointId = "launch-01",
                label = "tower-a-launch",
                location = GeoPointWire(
                    lat = 25.03391,
                    lng = 121.56452
                )
            ),
            orderedWaypoints = listOf(
                OrderedWaypointWire(
                    waypointId = "wp-001",
                    sequence = 1,
                    location = GeoPointWire(
                        lat = 25.03412,
                        lng = 121.56472
                    ),
                    altitudeMeters = 35.0,
                    speedMetersPerSecond = 4.0
                ),
                OrderedWaypointWire(
                    waypointId = "wp-002",
                    sequence = 2,
                    location = GeoPointWire(
                        lat = 25.03441,
                        lng = 121.56501
                    ),
                    altitudeMeters = 35.0,
                    speedMetersPerSecond = 4.0
                )
            ),
            implicitReturnToLaunch = true,
            routingMode = "road_network_following",
            flightProfile = FlightProfileWire(
                defaultAltitudeM = 35.0,
                defaultSpeedMps = 4.0,
                maxApproachSpeedMps = 2.0
            ),
            operatingProfile = "outdoor_gps_patrol",
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
