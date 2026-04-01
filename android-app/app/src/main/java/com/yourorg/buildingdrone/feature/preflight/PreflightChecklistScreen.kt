package com.yourorg.buildingdrone.feature.preflight

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
fun PreflightChecklistScreen(
    state: PreflightUiState,
    onApprove: () -> Unit,
    onUploadMission: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Preflight Checklist", style = MaterialTheme.typography.headlineSmall)
                state.warning?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                if (state.blockers.isEmpty()) {
                    Text("No blocking items.")
                } else {
                    state.blockers.forEach { blocker -> Text("Blocker: $blocker") }
                }
            }
        }
        state.checklist.forEach { item ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(item.label, style = MaterialTheme.typography.titleMedium)
                    Text(if (item.passed) "PASS" else "CHECK", style = MaterialTheme.typography.bodySmall)
                    Text(item.detail, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onApprove, modifier = Modifier.weight(1f)) {
                Text("Approve Preflight")
            }
            FilledTonalButton(
                onClick = onUploadMission,
                modifier = Modifier.weight(1f),
                enabled = state.readyToUpload || state.blockers.isEmpty()
            ) {
                Text("Upload + Start")
            }
        }
    }
}
