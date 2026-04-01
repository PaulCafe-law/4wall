package com.yourorg.buildingdrone.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.feature.branchverify.BranchVerifyUiState
import com.yourorg.buildingdrone.feature.emergency.EmergencyUiState
import com.yourorg.buildingdrone.feature.inspection.InspectionCaptureUiState
import com.yourorg.buildingdrone.feature.mission.MissionSetupUiState
import com.yourorg.buildingdrone.feature.preflight.PreflightUiState
import com.yourorg.buildingdrone.feature.transit.TransitUiState

@Composable
fun ConsoleHomeScreen(
    missionBundle: MissionBundle?,
    missionSetup: MissionSetupUiState,
    preflight: PreflightUiState,
    transit: TransitUiState,
    branchVerify: BranchVerifyUiState,
    inspection: InspectionCaptureUiState,
    emergency: EmergencyUiState
) {
    val sections = listOf(
        "Mission Setup" to "Bundle loaded: ${missionSetup.bundleLoaded}, demo: ${missionSetup.demoMode}",
        "Preflight Checklist" to "Blockers: ${preflight.blockers.size}, ready: ${preflight.readyToUpload}",
        "In-Flight Main" to "State: ${transit.stateLabel}, emergency rail: ${transit.emergencyVisible}",
        "Branch Confirm" to "Options: ${branchVerify.availableOptions.joinToString()}",
        "Inspection Capture" to "Viewpoint: ${inspection.viewpointLabel}",
        "Emergency / Hold / RTH" to emergency.reason
    )

    Scaffold { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Building Route Assistant",
                style = MaterialTheme.typography.headlineMedium
            )
            Text(
                text = missionBundle?.let {
                    "Mission ${it.missionId}, ${it.corridorSegments.size} segments, ${it.inspectionViewpoints.size} viewpoints"
                } ?: "Loading mission bundle..."
            )
            LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(sections) { section ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Row(modifier = Modifier.padding(16.dp)) {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(section.first, style = MaterialTheme.typography.titleMedium)
                                Text(section.second, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                }
            }
        }
    }
}
