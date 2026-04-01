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
                Text("飛行中主畫面", style = MaterialTheme.typography.headlineSmall)
                Text(state.stateLabel, style = MaterialTheme.typography.titleMedium)
                Text(state.progressLabel, style = MaterialTheme.typography.bodyLarge)
                LinearProgressIndicator(progress = { if (state.isCompleted) 1f else 0.58f }, modifier = Modifier.fillMaxWidth())
                state.partialWarning?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                state.riskReason?.let { Text("風險：$it", style = MaterialTheme.typography.bodyMedium) }
                Text("下一步：${state.nextStep}", style = MaterialTheme.typography.bodyMedium)
            }
        }
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("遙測摘要", style = MaterialTheme.typography.titleMedium)
                state.telemetry.forEach { field ->
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(field.label)
                        Text(field.value)
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onReplayTelemetry, modifier = Modifier.weight(1f)) { Text("回放") }
            OutlinedButton(onClick = onTriggerBranch, modifier = Modifier.weight(1f)) { Text("岔路確認") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onTriggerObstacleWarn, modifier = Modifier.weight(1f)) { Text("障礙警示") }
            OutlinedButton(onClick = onTriggerObstacleHardStop, modifier = Modifier.weight(1f)) { Text("硬停") }
            OutlinedButton(onClick = onClearObstacle, modifier = Modifier.weight(1f)) { Text("清除") }
        }
        FilledTonalButton(onClick = onApproachInspection, modifier = Modifier.fillMaxWidth()) {
            Text("進入巡檢視點")
        }
    }
}
