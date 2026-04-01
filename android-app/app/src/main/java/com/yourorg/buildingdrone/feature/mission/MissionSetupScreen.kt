package com.yourorg.buildingdrone.feature.mission

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun MissionSetupScreen(
    state: MissionSetupUiState,
    onLoadMockMission: () -> Unit,
    onReplay: () -> Unit,
    onGoPreflight: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Mission Setup", style = MaterialTheme.typography.headlineSmall)
                Text(state.missionLabel, style = MaterialTheme.typography.titleMedium)
                Text("Artifact status: ${state.artifactStatus}", style = MaterialTheme.typography.bodyMedium)
                state.warning?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            }
        }
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Mission Summary", style = MaterialTheme.typography.titleMedium)
                if (state.summary.isEmpty()) {
                    Text("No mission summary yet. Load mock mission bundle first.")
                } else {
                    state.summary.forEach { line -> Text(line) }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilledTonalButton(onClick = onLoadMockMission, modifier = Modifier.weight(1f)) {
                Text("Load Mock Mission")
            }
            OutlinedButton(onClick = onReplay, modifier = Modifier.weight(1f)) {
                Text("Demo Replay")
            }
        }
        FilledTonalButton(
            onClick = onGoPreflight,
            modifier = Modifier.fillMaxWidth(),
            enabled = state.bundleLoaded
        ) {
            Text("Open Preflight Checklist")
        }
    }
}
