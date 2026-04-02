package com.yourorg.buildingdrone.app

import com.yourorg.buildingdrone.data.network.CorridorPolicyWire
import com.yourorg.buildingdrone.data.network.FlightProfileWire
import com.yourorg.buildingdrone.data.network.GeoPointWire
import com.yourorg.buildingdrone.data.network.InspectionIntentWire
import com.yourorg.buildingdrone.data.network.InspectionViewpointRequestWire
import com.yourorg.buildingdrone.data.network.MissionPlanRequestWire
import com.yourorg.buildingdrone.data.network.TargetBuildingWire

fun defaultProdMissionPlanRequest(): MissionPlanRequestWire {
    return MissionPlanRequestWire(
        missionName = "Mini 4 Pro Building Route Beta",
        origin = GeoPointWire(
            lat = 25.03391,
            lng = 121.56452
        ),
        targetBuilding = TargetBuildingWire(
            buildingId = "tw-tpe-demo-tower",
            label = "Taipei Demo Tower"
        ),
        routingMode = "road_network_following",
        corridorPolicy = CorridorPolicyWire(
            defaultHalfWidthM = 8.0,
            maxHalfWidthM = 12.0,
            branchConfirmRadiusM = 10.0
        ),
        flightProfile = FlightProfileWire(
            defaultAltitudeM = 35.0,
            defaultSpeedMps = 4.0,
            maxApproachSpeedMps = 2.0
        ),
        inspectionIntent = InspectionIntentWire(
            viewpoints = listOf(
                InspectionViewpointRequestWire(
                    viewpointId = "vp-ne-facade",
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
