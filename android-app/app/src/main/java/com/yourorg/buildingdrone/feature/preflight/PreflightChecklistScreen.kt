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
import com.yourorg.buildingdrone.ui.toStatusCopy

@Composable
fun PreflightChecklistScreen(
    state: PreflightUiState,
    onApprove: () -> Unit,
    onUploadMission: () -> Unit
) {
    val statusCopy = state.status.toStatusCopy(MaterialTheme.colorScheme)

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Preflight Checklist", style = MaterialTheme.typography.headlineSmall)
                Text(
                    "\u72c0\u614b: ${statusCopy.label}",
                    color = statusCopy.tone,
                    style = MaterialTheme.typography.titleMedium
                )
                Text("\u6a21\u5f0f: ${state.modeLabel}", style = MaterialTheme.typography.bodySmall)
                state.warning?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                Text("\u4e0b\u4e00\u6b65: ${state.nextStep}", style = MaterialTheme.typography.bodyMedium)
                Text(state.decisionHint, style = MaterialTheme.typography.bodySmall)
                if (state.blockers.isEmpty()) {
                    Text(
                        "\u76ee\u524d\u6c92\u6709 blocking gate\u3002",
                        style = MaterialTheme.typography.bodyMedium
                    )
                } else {
                    state.blockers.forEach { blocker ->
                        Text(
                            "\u963b\u585e: $blocker",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }
        }
        state.checklist.forEach { item ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(item.label, style = MaterialTheme.typography.titleMedium)
                    Text(
                        if (item.passed) "\u5df2\u901a\u904e" else "\u672a\u901a\u904e",
                        color = if (item.passed) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                    Text(item.detail, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onApprove, modifier = Modifier.weight(1f)) {
                Text("\u78ba\u8a8d Preflight")
            }
            FilledTonalButton(
                onClick = onUploadMission,
                modifier = Modifier.weight(1f),
                enabled = state.readyToUpload
            ) {
                Text("\u4e0a\u50b3\u4e26\u8d77\u98db")
            }
        }
    }
}
