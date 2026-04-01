package com.yourorg.buildingdrone.feature.transit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun InFlightMainScreen(
    state: TransitUiState,
    onReplayTelemetry: () -> Unit,
    onTriggerBranch: () -> Unit,
    onTriggerObstacleWarn: () -> Unit,
    onTriggerObstacleHardStop: () -> Unit,
    onClearObstacle: () -> Unit,
    onApproachInspection: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("In-Flight Main", style = MaterialTheme.typography.headlineSmall)
                Text(state.stateLabel, style = MaterialTheme.typography.titleMedium)
                Text(state.progressLabel, style = MaterialTheme.typography.bodyLarge)
                LinearProgressIndicator(progress = { if (state.stateLabel == "COMPLETED") 1f else 0.58f }, modifier = Modifier.fillMaxWidth())
                state.partialWarning?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                state.riskReason?.let { Text("Risk: $it", style = MaterialTheme.typography.bodyMedium) }
                Text("Next: ${state.nextStep}", style = MaterialTheme.typography.bodyMedium)
            }
        }
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Telemetry Strip", style = MaterialTheme.typography.titleMedium)
                state.telemetry.forEach { field ->
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(field.label)
                        Text(field.value)
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onReplayTelemetry, modifier = Modifier.weight(1f)) { Text("Replay") }
            OutlinedButton(onClick = onTriggerBranch, modifier = Modifier.weight(1f)) { Text("Branch Confirm") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onTriggerObstacleWarn, modifier = Modifier.weight(1f)) { Text("Obstacle Warn") }
            OutlinedButton(onClick = onTriggerObstacleHardStop, modifier = Modifier.weight(1f)) { Text("Hard Stop") }
            OutlinedButton(onClick = onClearObstacle, modifier = Modifier.weight(1f)) { Text("Clear") }
        }
        FilledTonalButton(onClick = onApproachInspection, modifier = Modifier.fillMaxWidth()) {
            Text("Approach Inspection Viewpoint")
        }
    }
}
