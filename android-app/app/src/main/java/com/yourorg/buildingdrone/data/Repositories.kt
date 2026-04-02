package com.yourorg.buildingdrone.data

import java.io.File
import java.nio.charset.StandardCharsets
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

interface MissionRepository {
    suspend fun loadMissionBundle(): MissionBundle?
    suspend fun loadActiveFlightContext(): ActiveFlightContext? = null
    suspend fun syncMissionBundle(): MissionSyncResult = MissionSyncResult.Failure("Mission sync unavailable")
}

interface FlightLogRepository {
    suspend fun append(event: String)
    suspend fun readAll(): List<String>
}

interface DeviceStorageRepository {
    fun availableBytes(): Long
}

class FakeMissionRepository(
    private val missionBundle: MissionBundle
) : MissionRepository {
    override suspend fun loadMissionBundle(): MissionBundle = missionBundle
}

class InMemoryFlightLogRepository : FlightLogRepository {
    private val events = mutableListOf<String>()

    override suspend fun append(event: String) {
        events += event
    }

    override suspend fun readAll(): List<String> = events.toList()
}

class StaticDeviceStorageRepository(
    private val bytes: Long
) : DeviceStorageRepository {
    override fun availableBytes(): Long = bytes
}

class FileDeviceStorageRepository(
    private val root: File
) : DeviceStorageRepository {
    override fun availableBytes(): Long = root.usableSpace
}

fun seedMissionBundle(
    rootDirectory: File,
    missionBundle: MissionBundle = demoMissionBundle()
): MissionBundle {
    rootDirectory.mkdirs()

    val missionMetaFile = File(rootDirectory, "mission_meta.json")
    val missionKmzFile = File(rootDirectory, "mission.kmz")

    missionMetaFile.writeText(buildMissionMetaJson(missionBundle), StandardCharsets.UTF_8)
    writeKmzSeed(missionKmzFile, missionBundle)

    return missionBundle.copy(
        artifacts = MissionArtifacts(
            missionKmz = missionBundle.artifacts.missionKmz.copy(
                localPath = missionKmzFile.absolutePath,
                sizeBytes = missionKmzFile.length()
            ),
            missionMeta = missionBundle.artifacts.missionMeta.copy(
                localPath = missionMetaFile.absolutePath,
                sizeBytes = missionMetaFile.length()
            )
        ),
        verification = missionBundle.verification.copy(
            missionMetaPresent = true,
            missionKmzPresent = true,
            missionMetaChecksumVerified = true,
            missionKmzChecksumVerified = true
        )
    )
}

data class ActiveFlightContext(
    val missionId: String,
    val flightId: String
)

sealed interface MissionSyncResult {
    data class Success(
        val bundle: MissionBundle,
        val flightContext: ActiveFlightContext,
        val statusMessage: String,
        val reusedCache: Boolean
    ) : MissionSyncResult

    data class Failure(
        val message: String
    ) : MissionSyncResult
}

private fun buildMissionMetaJson(bundle: MissionBundle): String {
    return """
        {
          "missionId": "${bundle.missionId}",
          "bundleVersion": "${bundle.bundleVersion}",
          "artifactVersion": ${bundle.artifacts.missionMeta.version},
          "checksum": "${bundle.artifacts.missionMeta.checksum}",
          "segments": ${bundle.corridorSegments.size},
          "verificationPoints": ${bundle.verificationPoints.size},
          "inspectionViewpoints": ${bundle.inspectionViewpoints.size},
          "safetyDefaults": {
            "semanticTimeout": "${bundle.failsafe.onSemanticTimeout}",
            "batteryCritical": "${bundle.failsafe.onBatteryCritical}",
            "frameDrop": "${bundle.failsafe.onFrameDrop}"
          }
        }
    """.trimIndent()
}

private fun writeKmzSeed(target: File, bundle: MissionBundle) {
    ZipOutputStream(target.outputStream().buffered()).use { zip ->
        zip.putNextEntry(ZipEntry("waylines.wpml"))
        zip.write(
            """
            <waylines missionId="${bundle.missionId}">
              <segmentCount>${bundle.corridorSegments.size}</segmentCount>
            </waylines>
            """.trimIndent().toByteArray(StandardCharsets.UTF_8)
        )
        zip.closeEntry()

        zip.putNextEntry(ZipEntry("mission.kml"))
        zip.write(
            """
            <kml>
              <Document>
                <name>${bundle.missionId}</name>
              </Document>
            </kml>
            """.trimIndent().toByteArray(StandardCharsets.UTF_8)
        )
        zip.closeEntry()
    }
}
