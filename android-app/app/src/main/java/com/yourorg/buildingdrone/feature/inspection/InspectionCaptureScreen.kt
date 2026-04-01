package com.yourorg.buildingdrone.feature.inspection

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
fun InspectionCaptureScreen(
    state: InspectionCaptureUiState,
    onAlign: () -> Unit,
    onCapture: () -> Unit,
    onHold: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("巡檢拍攝", style = MaterialTheme.typography.headlineSmall)
                Text(state.viewpointLabel, style = MaterialTheme.typography.titleMedium)
                Text(state.alignmentStatus, style = MaterialTheme.typography.bodyLarge)
                state.reason?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            }
        }
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("取景檢查清單", style = MaterialTheme.typography.titleMedium)
                if (state.framingHints.isEmpty()) {
                    Text("目前還沒有取景提示。")
                } else {
                    state.framingHints.forEach { hint -> Text(hint) }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = onAlign,
                modifier = Modifier.weight(1f),
                enabled = !state.captureEnabled
            ) {
                Text("對齊視角")
            }
            FilledTonalButton(
                onClick = onCapture,
                modifier = Modifier.weight(1f),
                enabled = state.captureEnabled
            ) {
                Text("拍攝")
            }
            OutlinedButton(onClick = onHold, modifier = Modifier.weight(1f)) { Text("懸停") }
        }
    }
}
