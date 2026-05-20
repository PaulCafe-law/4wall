package com.yourorg.buildingdrone.dji.real

import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.data.OrderedWaypoint
import com.yourorg.buildingdrone.dji.KmzGenerationSource
import com.yourorg.buildingdrone.dji.MissionKmzPreparer
import com.yourorg.buildingdrone.dji.PreparedMissionKmz
import java.io.File
import java.security.MessageDigest
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class DjiFlyShapeMissionKmzPreparer(
    private val outputDirectory: File,
    private val clockMillis: () -> Long = { System.currentTimeMillis() },
) : MissionKmzPreparer {
    init {
        outputDirectory.mkdirs()
    }

    override fun prepare(missionBundle: MissionBundle): PreparedMissionKmz {
        val orderedWaypoints = missionBundle.orderedWaypoints.sortedBy { it.sequence }
        require(orderedWaypoints.size >= MINIMUM_WAYPOINT_COUNT) {
            "DJI Fly-shaped waypoint mission requires at least $MINIMUM_WAYPOINT_COUNT waypoints."
        }

        val generatedMs = clockMillis()
        val tempOutput = File(outputDirectory, "${sanitize(missionBundle.missionId)}-dji-fly-shape.tmp.kmz")
        if (tempOutput.exists()) {
            tempOutput.delete()
        }

        ZipOutputStream(tempOutput.outputStream().buffered()).use { archive ->
            archive.writeEntry("wpmz/template.kml", buildTemplateKml(generatedMs, missionBundle.returnHomeOnFinish))
            archive.writeEntry("wpmz/waylines.wpml", buildWaylinesWpml(orderedWaypoints, missionBundle.returnHomeOnFinish))
        }

        require(tempOutput.exists() && tempOutput.length() > 0L) {
            "DJI Fly-shaped KMZ was not created."
        }

        val sha = sha256(tempOutput.readBytes())
        val finalOutput = File(outputDirectory, "android-dji-fly-shape-${sha.take(SHORT_SHA_LENGTH)}.kmz")
        if (finalOutput.exists()) {
            finalOutput.delete()
        }
        require(tempOutput.renameTo(finalOutput)) {
            "Unable to stage DJI Fly-shaped KMZ candidate."
        }

        return PreparedMissionKmz(
            source = KmzGenerationSource.ANDROID_DJI_FLY_SHAPE,
            localPath = finalOutput.absolutePath,
            displayName = finalOutput.name
        )
    }

    private fun ZipOutputStream.writeEntry(name: String, content: String) {
        putNextEntry(ZipEntry(name))
        write(content.toByteArray(Charsets.UTF_8))
        closeEntry()
    }

    private fun buildTemplateKml(generatedMs: Long, returnHomeOnFinish: Boolean): String {
        return """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="$WPML_NAMESPACE">
  <Document>
    <wpml:author>4Wall AI</wpml:author>
    <wpml:createTime>$generatedMs</wpml:createTime>
    <wpml:updateTime>$generatedMs</wpml:updateTime>
${missionConfigXml(returnHomeOnFinish, indent = "    ")}
  </Document>
</kml>
"""
    }

    private fun buildWaylinesWpml(orderedWaypoints: List<OrderedWaypoint>, returnHomeOnFinish: Boolean): String {
        val placemarks = orderedWaypoints
            .mapIndexed { index, waypoint -> waypointPlacemark(index, waypoint, orderedWaypoints.size) }
            .joinToString(separator = "\n")

        return """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="$WPML_NAMESPACE">
  <Document>
${missionConfigXml(returnHomeOnFinish, indent = "    ")}
    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>0</wpml:distance>
      <wpml:duration>0</wpml:duration>
      <wpml:autoFlightSpeed>${fmt(DJI_FLY_BASELINE_SPEED_METERS_PER_SECOND)}</wpml:autoFlightSpeed>
$placemarks
    </Folder>
  </Document>
</kml>
"""
    }

    private fun missionConfigXml(returnHomeOnFinish: Boolean, indent: String): String {
        val childIndent = "$indent  "
        val finishAction = if (returnHomeOnFinish) "goHome" else "noAction"
        return """$indent<wpml:missionConfig>
$childIndent<wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
$childIndent<wpml:finishAction>$finishAction</wpml:finishAction>
$childIndent<wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
$childIndent<wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
$childIndent<wpml:globalTransitionalSpeed>${fmt(DJI_FLY_BASELINE_SPEED_METERS_PER_SECOND)}</wpml:globalTransitionalSpeed>
$childIndent<wpml:droneInfo>
$childIndent  <wpml:droneEnumValue>$MINI_4_PRO_DRONE_ENUM_VALUE</wpml:droneEnumValue>
$childIndent  <wpml:droneSubEnumValue>$MINI_4_PRO_DRONE_SUB_ENUM_VALUE</wpml:droneSubEnumValue>
$childIndent</wpml:droneInfo>
$indent</wpml:missionConfig>"""
    }

    private fun waypointPlacemark(index: Int, waypoint: OrderedWaypoint, waypointCount: Int): String {
        val headingAngleEnable = if (waypointCount <= 2 || index == 0 || index == waypointCount - 1) 1 else 0
        val turnMode = if (waypointCount <= 2 || index == 0 || index == waypointCount - 1) {
            "toPointAndStopWithContinuityCurvature"
        } else {
            "toPointAndPassWithContinuityCurvature"
        }
        val actionGroups = gimbalActionGroups(index, waypointCount)
        return """      <Placemark>
        <Point>
          <coordinates>
            ${fmt(waypoint.location.lng)},${fmt(waypoint.location.lat)}
          </coordinates>
        </Point>
        <wpml:index>$index</wpml:index>
        <wpml:executeHeight>${fmt(DJI_FLY_BASELINE_ALTITUDE_METERS)}</wpml:executeHeight>
        <wpml:waypointSpeed>${fmt(DJI_FLY_BASELINE_SPEED_METERS_PER_SECOND)}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
          <wpml:waypointHeadingAngleEnable>$headingAngleEnable</wpml:waypointHeadingAngleEnable>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
          <wpml:waypointHeadingPoiIndex>0</wpml:waypointHeadingPoiIndex>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>$turnMode</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>0</wpml:useStraightLine>
$actionGroups
        <wpml:waypointGimbalHeadingParam>
          <wpml:waypointGimbalPitchAngle>0</wpml:waypointGimbalPitchAngle>
          <wpml:waypointGimbalYawAngle>0</wpml:waypointGimbalYawAngle>
        </wpml:waypointGimbalHeadingParam>
      </Placemark>"""
    }

    private fun gimbalActionGroups(index: Int, waypointCount: Int): String {
        if (waypointCount <= 1) {
            return gimbalRotateActionGroup(index)
        }
        return buildList {
            if (index == 0) {
                add(gimbalRotateActionGroup(index))
            }
            if (index < waypointCount - 1) {
                add(gimbalEvenlyRotateActionGroup(index))
            }
        }.joinToString(separator = "\n")
    }

    private fun gimbalRotateActionGroup(index: Int): String {
        return """        <wpml:actionGroup>
          <wpml:actionGroupId>1</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>$index</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>$index</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>parallel</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>1</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalHeadingYawBase>aircraft</wpml:gimbalHeadingYawBase>
              <wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>
              <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
              <wpml:gimbalPitchRotateAngle>0</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable>
              <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
              <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>
              <wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
        </wpml:actionGroup>"""
    }

    private fun gimbalEvenlyRotateActionGroup(index: Int): String {
        return """        <wpml:actionGroup>
          <wpml:actionGroupId>2</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>$index</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${index + 1}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>parallel</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>${index + 2}</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalEvenlyRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalPitchRotateAngle>0</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
        </wpml:actionGroup>"""
    }

    private fun sanitize(value: String): String {
        return value.replace(Regex("[^A-Za-z0-9_.-]"), "_").ifBlank { "mission" }
    }

    private fun sha256(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digest.joinToString(separator = "") { byte -> "%02x".format(byte) }
    }

    private fun fmt(value: Double): String {
        val raw = String.format(Locale.US, "%.13f", value)
        return raw.trimEnd('0').trimEnd('.').ifBlank { "0" }
    }

    companion object {
        private const val WPML_NAMESPACE = "http://www.uav.com/wpmz/1.0.2"
        private const val MINI_4_PRO_DRONE_ENUM_VALUE = 68
        private const val MINI_4_PRO_DRONE_SUB_ENUM_VALUE = 0
        private const val MINIMUM_WAYPOINT_COUNT = 2
        private const val SHORT_SHA_LENGTH = 12
        private const val DJI_FLY_BASELINE_ALTITUDE_METERS = 50.0
        private const val DJI_FLY_BASELINE_SPEED_METERS_PER_SECOND = 2.5
    }
}
