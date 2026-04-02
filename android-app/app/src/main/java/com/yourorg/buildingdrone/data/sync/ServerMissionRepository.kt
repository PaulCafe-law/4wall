package com.yourorg.buildingdrone.data.sync

import com.yourorg.buildingdrone.core.GeoPoint
import com.yourorg.buildingdrone.data.ActiveFlightContext
import com.yourorg.buildingdrone.data.CorridorSegment
import com.yourorg.buildingdrone.data.InspectionViewpoint
import com.yourorg.buildingdrone.data.MissionArtifact
import com.yourorg.buildingdrone.data.MissionArtifacts
import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.data.MissionBundleVerification
import com.yourorg.buildingdrone.data.MissionFailsafe
import com.yourorg.buildingdrone.data.MissionRepository
import com.yourorg.buildingdrone.data.MissionSyncResult
import com.yourorg.buildingdrone.data.VerificationPoint
import com.yourorg.buildingdrone.data.auth.plannerJson
import com.yourorg.buildingdrone.data.network.CachedMissionRecord
import com.yourorg.buildingdrone.data.network.MissionArtifactDescriptorWire
import com.yourorg.buildingdrone.data.network.MissionBundleWire
import com.yourorg.buildingdrone.data.network.MissionMetaWire
import com.yourorg.buildingdrone.data.network.MissionPlanRequestWire
import com.yourorg.buildingdrone.data.network.MissionPlanResponseWire
import com.yourorg.buildingdrone.data.network.PlannerAuthException
import com.yourorg.buildingdrone.data.network.PlannerGateway
import com.yourorg.buildingdrone.data.network.PlannerHttpException
import com.yourorg.buildingdrone.domain.semantic.BranchDecision
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.UUID

class ServerMissionRepository(
    private val plannerApi: PlannerGateway,
    rootDirectory: File,
    private val planRequestFactory: () -> MissionPlanRequestWire,
    private val json: Json = plannerJson
) : MissionRepository {
    private val cacheRoot = File(rootDirectory, "missions")
    private val activeDirectory = File(cacheRoot, "active")
    private val stagingDirectory = File(cacheRoot, "staging")

    init {
        cacheRoot.mkdirs()
        stagingDirectory.mkdirs()
    }

    override suspend fun loadMissionBundle(): MissionBundle? {
        return withContext(Dispatchers.IO) {
            readCachedRecord()?.let(::recordToBundle)
        }
    }

    override suspend fun loadActiveFlightContext(): ActiveFlightContext? {
        return withContext(Dispatchers.IO) {
            val record = readCachedRecord() ?: return@withContext null
            ActiveFlightContext(
                missionId = record.missionId,
                flightId = record.flightId
            )
        }
    }

    override suspend fun syncMissionBundle(): MissionSyncResult {
        return withContext(Dispatchers.IO) {
            try {
                val response = retryWithBackoff("mission plan") {
                    plannerApi.planMission(planRequestFactory())
                }
                val cached = readCachedRecord()
                if (cached != null &&
                    cached.missionId == response.missionId &&
                    cached.missionKmz.version == response.artifacts.missionKmz.version &&
                    cached.missionMeta.version == response.artifacts.missionMeta.version
                ) {
                    return@withContext MissionSyncResult.Success(
                        bundle = recordToBundle(cached),
                        flightContext = ActiveFlightContext(cached.missionId, cached.flightId),
                        statusMessage = "Mission bundle already cached and verified.",
                        reusedCache = true
                    )
                }

                val staging = File(stagingDirectory, response.missionId).apply {
                    deleteRecursively()
                    mkdirs()
                }
                val kmzFile = File(staging, "mission.kmz")
                val metaFile = File(staging, "mission_meta.json")

                val kmz = retryWithBackoff("mission.kmz download") {
                    plannerApi.downloadArtifact(response.artifacts.missionKmz.downloadUrl)
                }
                val meta = retryWithBackoff("mission_meta.json download") {
                    plannerApi.downloadArtifact(response.artifacts.missionMeta.downloadUrl)
                }

                verifyArtifact(
                    bytes = kmz.bytes,
                    descriptor = response.artifacts.missionKmz,
                    checksumHeader = kmz.checksumHeader,
                    versionHeader = kmz.versionHeader,
                    artifactName = "mission.kmz"
                )
                verifyArtifact(
                    bytes = meta.bytes,
                    descriptor = response.artifacts.missionMeta,
                    checksumHeader = meta.checksumHeader,
                    versionHeader = meta.versionHeader,
                    artifactName = "mission_meta.json"
                )

                kmzFile.writeBytes(kmz.bytes)
                metaFile.writeBytes(meta.bytes)

                validateMissionMeta(meta.bytes, response)

                val flightContext = ActiveFlightContext(
                    missionId = response.missionId,
                    flightId = "flt_${System.currentTimeMillis()}_${UUID.randomUUID().toString().take(8)}"
                )
                val record = CachedMissionRecord(
                    missionId = response.missionId,
                    flightId = flightContext.flightId,
                    bundleVersion = response.bundleVersion,
                    missionBundle = response.missionBundle,
                    missionKmz = response.artifacts.missionKmz,
                    missionMeta = response.artifacts.missionMeta,
                    missionKmzPath = kmzFile.absolutePath,
                    missionMetaPath = metaFile.absolutePath
                )
                File(staging, MANIFEST_NAME).writeText(
                    text = json.encodeToString(CachedMissionRecord.serializer(), record),
                    charset = Charsets.UTF_8
                )

                promoteToActive(staging)
                val activeRecord = record.copy(
                    missionKmzPath = File(activeDirectory, "mission.kmz").absolutePath,
                    missionMetaPath = File(activeDirectory, "mission_meta.json").absolutePath
                )
                File(activeDirectory, MANIFEST_NAME).writeText(
                    text = json.encodeToString(CachedMissionRecord.serializer(), activeRecord),
                    charset = Charsets.UTF_8
                )

                MissionSyncResult.Success(
                    bundle = recordToBundle(activeRecord),
                    flightContext = flightContext,
                    statusMessage = "Mission bundle downloaded, verified, and cached for offline use.",
                    reusedCache = false
                )
            } catch (_: PlannerAuthException) {
                MissionSyncResult.Failure("Operator authentication expired. Sign in again before downloading a mission.")
            } catch (error: IOException) {
                MissionSyncResult.Failure(error.message ?: "Mission download failed")
            } catch (error: IllegalArgumentException) {
                MissionSyncResult.Failure(error.message ?: "Mission verification failed")
            } catch (error: IllegalStateException) {
                MissionSyncResult.Failure(error.message ?: "Mission verification failed")
            }
        }
    }

    private suspend fun <T> retryWithBackoff(label: String, block: suspend () -> T): T {
        var lastError: Throwable? = null
        repeat(3) { attempt ->
            try {
                return block()
            } catch (error: PlannerAuthException) {
                throw error
            } catch (error: PlannerHttpException) {
                lastError = error
                if (error.statusCode in 400..499) {
                    throw IOException("$label failed with HTTP ${error.statusCode}", error)
                }
            } catch (error: IOException) {
                lastError = error
            }
            delay((250L * (attempt + 1)) * (attempt + 1))
        }
        throw IOException("$label failed after retries", lastError)
    }

    private fun verifyArtifact(
        bytes: ByteArray,
        descriptor: MissionArtifactDescriptorWire,
        checksumHeader: String?,
        versionHeader: Int?,
        artifactName: String
    ) {
        val checksum = sha256(bytes)
        require(checksum == descriptor.checksumSha256) {
            "$artifactName checksum mismatch"
        }
        if (checksumHeader != null) {
            require(checksumHeader == descriptor.checksumSha256) {
                "$artifactName checksum header mismatch"
            }
        }
        if (versionHeader != null) {
            require(versionHeader == descriptor.version) {
                "$artifactName version header mismatch"
            }
        }
    }

    private fun validateMissionMeta(
        bytes: ByteArray,
        response: MissionPlanResponseWire
    ) {
        val meta = try {
            json.decodeFromString(MissionMetaWire.serializer(), bytes.toString(Charsets.UTF_8))
        } catch (error: SerializationException) {
            throw IOException("mission_meta.json is not valid JSON", error)
        }
        require(meta.missionId == response.missionId) { "mission_meta.json missionId mismatch" }
        require(meta.bundleVersion == response.bundleVersion) { "mission_meta.json bundleVersion mismatch" }
        require(meta.artifacts.missionKmz.checksumSha256 == response.artifacts.missionKmz.checksumSha256) {
            "mission_meta.json mission.kmz checksum descriptor mismatch"
        }
    }

    private fun promoteToActive(staging: File) {
        val backup = File(cacheRoot, "active-backup")
        if (backup.exists()) {
            backup.deleteRecursively()
        }
        try {
            if (activeDirectory.exists() && !activeDirectory.renameTo(backup)) {
                backup.mkdirs()
                activeDirectory.copyRecursively(backup, overwrite = true)
                activeDirectory.deleteRecursively()
            }
            if (activeDirectory.exists()) {
                activeDirectory.deleteRecursively()
            }
            if (!staging.renameTo(activeDirectory)) {
                staging.copyRecursively(activeDirectory, overwrite = true)
                staging.deleteRecursively()
            }
            backup.deleteRecursively()
        } catch (error: Exception) {
            if (activeDirectory.exists()) {
                activeDirectory.deleteRecursively()
            }
            if (backup.exists()) {
                if (!backup.renameTo(activeDirectory)) {
                    backup.copyRecursively(activeDirectory, overwrite = true)
                    backup.deleteRecursively()
                }
            }
            throw IOException("Failed to promote verified mission bundle", error)
        }
    }

    private fun readCachedRecord(): CachedMissionRecord? {
        val manifest = File(activeDirectory, MANIFEST_NAME)
        if (!manifest.exists()) {
            return null
        }
        return try {
            json.decodeFromString(CachedMissionRecord.serializer(), manifest.readText(Charsets.UTF_8))
        } catch (_: Exception) {
            null
        }
    }

    private fun recordToBundle(record: CachedMissionRecord): MissionBundle {
        val missionKmz = File(record.missionKmzPath)
        val missionMeta = File(record.missionMetaPath)
        val missionKmzVerified = missionKmz.exists() && sha256(missionKmz.readBytes()) == record.missionKmz.checksumSha256
        val missionMetaVerified = missionMeta.exists() && sha256(missionMeta.readBytes()) == record.missionMeta.checksumSha256
        return MissionBundle(
            missionId = record.missionId,
            routeMode = record.missionBundle.routeMode,
            corridorSegments = record.missionBundle.corridorSegments.map { segment ->
                CorridorSegment(
                    segmentId = segment.segmentId,
                    polyline = segment.polyline.map { GeoPoint(it.lat, it.lng) },
                    halfWidthMeters = segment.halfWidthMeters,
                    suggestedAltitudeMeters = segment.suggestedAltitudeMeters,
                    suggestedSpeedMetersPerSecond = segment.suggestedSpeedMetersPerSecond
                )
            },
            verificationPoints = record.missionBundle.verificationPoints.map { point ->
                VerificationPoint(
                    verificationPointId = point.verificationPointId,
                    location = GeoPoint(point.location.lat, point.location.lng),
                    expectedOptions = point.expectedOptions.mapTo(LinkedHashSet()) { option -> option.toBranchDecision() },
                    timeoutMillis = point.timeoutMillis
                )
            },
            inspectionViewpoints = record.missionBundle.inspectionViewpoints.map { viewpoint ->
                InspectionViewpoint(
                    inspectionViewpointId = viewpoint.inspectionViewpointId,
                    location = GeoPoint(viewpoint.location.lat, viewpoint.location.lng),
                    yawDegrees = viewpoint.yawDegrees,
                    captureMode = viewpoint.captureMode,
                    label = viewpoint.label
                )
            },
            defaultAltitudeMeters = record.missionBundle.defaultAltitudeMeters,
            defaultSpeedMetersPerSecond = record.missionBundle.defaultSpeedMetersPerSecond,
            bundleVersion = record.bundleVersion,
            artifacts = MissionArtifacts(
                missionKmz = MissionArtifact(
                    name = "mission.kmz",
                    localPath = missionKmz.absolutePath,
                    checksum = record.missionKmz.checksumSha256,
                    version = record.missionKmz.version,
                    sizeBytes = missionKmz.length()
                ),
                missionMeta = MissionArtifact(
                    name = "mission_meta.json",
                    localPath = missionMeta.absolutePath,
                    checksum = record.missionMeta.checksumSha256,
                    version = record.missionMeta.version,
                    sizeBytes = missionMeta.length()
                )
            ),
            verification = MissionBundleVerification(
                schemaMajor = 1,
                missionMetaPresent = missionMeta.exists(),
                missionKmzPresent = missionKmz.exists(),
                missionMetaChecksumVerified = missionMetaVerified,
                missionKmzChecksumVerified = missionKmzVerified
            ),
            failsafe = MissionFailsafe(
                onSemanticTimeout = record.missionBundle.failsafe.onSemanticTimeout,
                onBatteryCritical = record.missionBundle.failsafe.onBatteryCritical,
                onFrameDrop = record.missionBundle.failsafe.onFrameDrop
            )
        )
    }

    private fun String.toBranchDecision(): BranchDecision = when (this) {
        "LEFT" -> BranchDecision.LEFT
        "RIGHT" -> BranchDecision.RIGHT
        "STRAIGHT" -> BranchDecision.STRAIGHT
        else -> BranchDecision.UNKNOWN
    }

    private fun sha256(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digest.joinToString(separator = "") { byte -> "%02x".format(byte) }
    }

    private companion object {
        const val MANIFEST_NAME = "bundle_manifest.json"
    }
}
