package com.yourorg.buildingdrone.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import com.yourorg.buildingdrone.feature.branchverify.BranchVerifyUiState
import com.yourorg.buildingdrone.feature.emergency.EmergencyUiState
import com.yourorg.buildingdrone.feature.inspection.InspectionCaptureUiState
import com.yourorg.buildingdrone.feature.mission.MissionSetupUiState
import com.yourorg.buildingdrone.feature.preflight.PreflightUiState
import com.yourorg.buildingdrone.feature.transit.TransitUiState
import com.yourorg.buildingdrone.ui.BuildingDroneTheme
import com.yourorg.buildingdrone.ui.ConsoleHomeScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as BuildingDroneApplication).container

        setContent {
            val missionBundle by produceState<com.yourorg.buildingdrone.data.MissionBundle?>(initialValue = null) {
                value = container.missionRepository.loadMissionBundle()
            }

            BuildingDroneTheme {
                ConsoleHomeScreen(
                    missionBundle = missionBundle,
                    missionSetup = MissionSetupUiState(
                        bundleLoaded = missionBundle != null,
                        demoMode = true
                    ),
                    preflight = PreflightUiState(blockers = emptyList(), readyToUpload = missionBundle != null),
                    transit = TransitUiState(stateLabel = "IDLE", emergencyVisible = true),
                    branchVerify = BranchVerifyUiState(availableOptions = listOf("LEFT", "STRAIGHT")),
                    inspection = InspectionCaptureUiState(viewpointLabel = "north-east-facade"),
                    emergency = EmergencyUiState(reason = "No active fail-safe")
                )
            }
        }
    }
}
