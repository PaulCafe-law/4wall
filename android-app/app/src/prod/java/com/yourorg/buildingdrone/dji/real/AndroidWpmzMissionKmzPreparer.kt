package com.yourorg.buildingdrone.dji.real

import android.content.Context
import com.dji.wpmzsdk.common.data.Template
import com.dji.wpmzsdk.manager.WPMZManager
import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.dji.KmzGenerationSource
import com.yourorg.buildingdrone.dji.MissionKmzPreparer
import com.yourorg.buildingdrone.dji.PreparedMissionKmz
import dji.sdk.wpmz.value.mission.WaylineAltitudeMode
import dji.sdk.wpmz.value.mission.WaylineCoordinateMode
import dji.sdk.wpmz.value.mission.WaylineCoordinateParam
import dji.sdk.wpmz.value.mission.WaylineDroneInfo
import dji.sdk.wpmz.value.mission.WaylineDroneType
import dji.sdk.wpmz.value.mission.WaylineExitOnRCLostAction
import dji.sdk.wpmz.value.mission.WaylineExitOnRCLostBehavior
import dji.sdk.wpmz.value.mission.WaylineFinishedAction
import dji.sdk.wpmz.value.mission.WaylineFlyToWaylineMode
import dji.sdk.wpmz.value.mission.WaylineLocationCoordinate2D
import dji.sdk.wpmz.value.mission.WaylineLocationCoordinate3D
import dji.sdk.wpmz.value.mission.WaylineMission
import dji.sdk.wpmz.value.mission.WaylineMissionConfig
import dji.sdk.wpmz.value.mission.WaylinePositioningType
import dji.sdk.wpmz.value.mission.WaylineTemplateWaypointInfo
import dji.sdk.wpmz.value.mission.WaylineWaypoint
import dji.sdk.wpmz.value.mission.WaylineWaypointPitchMode
import dji.sdk.wpmz.value.mission.WaylineWaypointTurnMode
import dji.sdk.wpmz.value.mission.WaylineWaypointYawMode
import dji.sdk.wpmz.value.mission.WaylineWaypointYawParam
import java.io.File
import java.security.MessageDigest

class AndroidWpmzMissionKmzPreparer(
    context: Context,
    private val outputDirectory: File = File(context.filesDir, "wpmz-executor-lab")
) : MissionKmzPreparer {
    private val appContext = context.applicationContext

    init {
        outputDirectory.mkdirs()
        WPMZManager.getInstance().init(appContext)
    }

    override fun prepare(missionBundle: MissionBundle): PreparedMissionKmz {
        val orderedWaypoints = missionBundle.orderedWaypoints.sortedBy { it.sequence }
        require(orderedWaypoints.isNotEmpty()) { "Android WPMZ generation requires at least one waypoint." }

        val tempOutput = File(outputDirectory, "${sanitize(missionBundle.missionId)}-android-wpmz.tmp.kmz")
        if (tempOutput.exists()) {
            tempOutput.delete()
        }

        WPMZManager.getInstance().generateKMZFile(
            tempOutput.absolutePath,
            createMission(),
            createMissionConfig(),
            createTemplate(missionBundle)
        )
        require(tempOutput.exists() && tempOutput.length() > 0L) {
            "DJI WPMZManager did not create a KMZ file."
        }

        val sha = sha256(tempOutput.readBytes())
        val finalOutput = File(outputDirectory, "android-wpmz-${sha.take(12)}.kmz")
        if (finalOutput.exists()) {
            finalOutput.delete()
        }
        require(tempOutput.renameTo(finalOutput)) {
            "Unable to stage Android WPMZ KMZ candidate."
        }

        return PreparedMissionKmz(
            source = KmzGenerationSource.ANDROID_WPMZ,
            localPath = finalOutput.absolutePath,
            displayName = finalOutput.name
        )
    }

    private fun createMission(): WaylineMission {
        val now = System.currentTimeMillis().toDouble()
        return WaylineMission().apply {
            createTime = now
            updateTime = now
            author = "4wall-ai"
        }
    }

    private fun createMissionConfig(): WaylineMissionConfig {
        return WaylineMissionConfig().apply {
            flyToWaylineMode = WaylineFlyToWaylineMode.SAFELY
            finishAction = WaylineFinishedAction.GO_HOME
            exitOnRCLostBehavior = WaylineExitOnRCLostBehavior.EXCUTE_RC_LOST_ACTION
            exitOnRCLostType = WaylineExitOnRCLostAction.GO_BACK
            globalTransitionalSpeed = GOLDEN_SPEED_METERS_PER_SECOND
            securityTakeOffHeight = DJI_SAMPLE_SECURITY_TAKEOFF_HEIGHT_METERS
            isSecurityTakeOffHeightSet = true
            droneInfo = WaylineDroneInfo(WaylineDroneType.WM260, MINI_4_PRO_SUB_TYPE)
            payloadInfo = emptyList()
        }
    }

    private fun createTemplate(missionBundle: MissionBundle): Template {
        return Template().apply {
            templateId = DEFAULT_TEMPLATE_ID
            coordinateParam = WaylineCoordinateParam().apply {
                coordinateMode = WaylineCoordinateMode.WGS84
                altitudeMode = WaylineAltitudeMode.RELATIVE_TO_START_POINT
                positioningType = WaylinePositioningType.GPS
                isWaylinePositioningTypeSet = true
            }
            useGlobalTransitionalSpeed = true
            transitionalSpeed = GOLDEN_SPEED_METERS_PER_SECOND
            autoFlightSpeed = GOLDEN_SPEED_METERS_PER_SECOND
            payloadParam = emptyList()
            waypointInfo = createWaypointInfo(missionBundle)
        }
    }

    private fun createWaypointInfo(missionBundle: MissionBundle): WaylineTemplateWaypointInfo {
        val waypoints = missionBundle.orderedWaypoints
            .sortedBy { it.sequence }
            .mapIndexed { index, waypoint ->
                WaylineWaypoint().apply {
                    waypointIndex = index
                    location = WaylineLocationCoordinate2D(
                        waypoint.location.lat,
                        waypoint.location.lng
                    )
                    height = GOLDEN_ALTITUDE_METERS
                    ellipsoidHeight = GOLDEN_ALTITUDE_METERS
                    useGlobalFlightHeight = true
                    speed = GOLDEN_SPEED_METERS_PER_SECOND
                    useGlobalAutoFlightSpeed = true
                    useStraightLine = true
                    useGlobalTurnParam = true
                    useGlobalYawParam = true
                    useGlobalGimbalHeadingParam = true
                    useGlobalActionGroup = true
                    isRisky = false
                }
            }

        return WaylineTemplateWaypointInfo().apply {
            this.waypoints = waypoints
            actionGroups = emptyList()
            globalFlightHeight = GOLDEN_ALTITUDE_METERS
            isGlobalFlightHeightSet = true
            globalTurnMode = WaylineWaypointTurnMode.TO_POINT_AND_STOP_WITH_DISCONTINUITY_CURVATURE
            isTemplateGlobalTurnModeSet = true
            useStraightLine = true
            globalYawParam = WaylineWaypointYawParam().apply {
                yawMode = WaylineWaypointYawMode.FOLLOW_WAYLINE
                enableYawAngle = false
                yawAngle = 0.0
                poiLocation = WaylineLocationCoordinate3D(0.0, 0.0, 0.0)
            }
            isTemplateGlobalYawParamSet = true
            pitchMode = WaylineWaypointPitchMode.USE_POINT_SETTING
            caliFlightEnable = false
        }
    }

    private fun sanitize(value: String): String {
        return value.replace(Regex("[^A-Za-z0-9_.-]"), "_").ifBlank { "mission" }
    }

    private fun sha256(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digest.joinToString(separator = "") { byte -> "%02x".format(byte) }
    }

    companion object {
        private const val DEFAULT_TEMPLATE_ID = 0
        private const val MINI_4_PRO_SUB_TYPE = 0
        private const val GOLDEN_ALTITUDE_METERS = 50.0
        private const val GOLDEN_SPEED_METERS_PER_SECOND = 2.5
        private const val DJI_SAMPLE_SECURITY_TAKEOFF_HEIGHT_METERS = 20.0
    }
}
