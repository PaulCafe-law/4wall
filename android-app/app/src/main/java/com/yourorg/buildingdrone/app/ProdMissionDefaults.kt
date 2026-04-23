package com.yourorg.buildingdrone.app

import com.yourorg.buildingdrone.data.network.FlightProfileWire
import com.yourorg.buildingdrone.data.network.GeoPointWire
import com.yourorg.buildingdrone.data.network.LaunchPointWire
import com.yourorg.buildingdrone.data.network.MissionPlanRequestWire
import com.yourorg.buildingdrone.data.network.OrderedWaypointWire

fun defaultProdMissionPlanRequest(): MissionPlanRequestWire {
    return MissionPlanRequestWire(
        missionName = "Mini 4 Pro Outdoor Patrol Beta",
        launchPoint = LaunchPointWire(
            launchPointId = "launch-01",
            label = "L",
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
                    lat = 25.03402,
                    lng = 121.56464
                ),
                altitudeMeters = 35.0,
                speedMetersPerSecond = 4.0
            ),
            OrderedWaypointWire(
                waypointId = "wp-002",
                sequence = 2,
                location = GeoPointWire(
                    lat = 25.03426,
                    lng = 121.56491
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
