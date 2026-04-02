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
import com.yourorg.buildingdrone.ui.toStatusCopy

@Composable
fun MissionSetupScreen(
    state: MissionSetupUiState,
    onLoadMockMission: () -> Unit,
    onReplay: () -> Unit,
    onGoPreflight: () -> Unit
) {
    val statusCopy = state.status.toStatusCopy(MaterialTheme.colorScheme)

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text("\u4efb\u52d9\u8a2d\u5b9a", style = MaterialTheme.typography.headlineSmall)
                Text(
                    "\u72c0\u614b: ${statusCopy.label}",
                    color = statusCopy.tone,
                    style = MaterialTheme.typography.titleMedium
                )
                Text(state.missionLabel, style = MaterialTheme.typography.titleMedium)
                Text("Artifacts: ${state.artifactStatus}", style = MaterialTheme.typography.bodyMedium)
                Text("\u4e0b\u4e00\u6b65: ${state.nextStep}", style = MaterialTheme.typography.bodyMedium)
                state.authStatus?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                state.warning?.let {
                    Text(
                        it,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text("\u4efb\u52d9\u6458\u8981", style = MaterialTheme.typography.titleMedium)
                if (state.summary.isEmpty()) {
                    Text(
                        "\u5c1a\u672a\u53d6\u5f97\u53ef\u98db\u4efb\u52d9\u5305\u3002",
                        style = MaterialTheme.typography.bodyMedium
                    )
                } else {
                    state.summary.forEach { line ->
                        Text(line, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilledTonalButton(onClick = onLoadMockMission, modifier = Modifier.weight(1f)) {
                Text(state.loadActionLabel)
            }
            OutlinedButton(onClick = onReplay, modifier = Modifier.weight(1f)) {
                Text("\u56de\u653e\u9059\u6e2c")
            }
        }
        FilledTonalButton(
            onClick = onGoPreflight,
            modifier = Modifier.fillMaxWidth(),
            enabled = state.bundleLoaded
        ) {
            Text("\u524d\u5f80 Preflight Checklist")
        }
    }
}
