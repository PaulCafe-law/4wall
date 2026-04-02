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
import com.yourorg.buildingdrone.ui.toStatusCopy

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
    val statusCopy = state.status.toStatusCopy(MaterialTheme.colorScheme)

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("\u4e3b\u822a\u6bb5\u76e3\u63a7", style = MaterialTheme.typography.headlineSmall)
                Text(
                    "\u72c0\u614b: ${statusCopy.label}",
                    color = statusCopy.tone,
                    style = MaterialTheme.typography.titleMedium
                )
                Text(state.stateLabel, style = MaterialTheme.typography.titleMedium)
                Text(state.progressLabel, style = MaterialTheme.typography.bodyLarge)
                LinearProgressIndicator(
                    progress = { if (state.isCompleted) 1f else if (state.isHold) 0.62f else 0.58f },
                    modifier = Modifier.fillMaxWidth()
                )
                state.riskReason?.let { Text("\u505c\u4f4f\u539f\u56e0: $it", style = MaterialTheme.typography.bodyMedium) }
                Text("\u4e0b\u4e00\u6b65: ${state.nextStep}", style = MaterialTheme.typography.bodyMedium)
                state.partialWarning?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            }
        }
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("\u5373\u6642\u9059\u6e2c", style = MaterialTheme.typography.titleMedium)
                state.telemetry.forEach { field ->
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(field.label)
                        Text(field.value)
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onReplayTelemetry, modifier = Modifier.weight(1f)) { Text("\u56de\u653e\u9059\u6e2c") }
            OutlinedButton(onClick = onTriggerBranch, modifier = Modifier.weight(1f)) { Text("Branch Confirm") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onTriggerObstacleWarn, modifier = Modifier.weight(1f)) { Text("\u969c\u7919\u8b66\u544a") }
            OutlinedButton(onClick = onTriggerObstacleHardStop, modifier = Modifier.weight(1f)) { Text("\u786c\u505c") }
            OutlinedButton(onClick = onClearObstacle, modifier = Modifier.weight(1f)) { Text("\u969c\u7919\u89e3\u9664") }
        }
        FilledTonalButton(onClick = onApproachInspection, modifier = Modifier.fillMaxWidth()) {
            Text("Inspection Viewpoint")
        }
    }
}
