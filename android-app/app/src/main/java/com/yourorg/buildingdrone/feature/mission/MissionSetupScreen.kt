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
                Text("任務設定", style = MaterialTheme.typography.headlineSmall)
                Text(state.missionLabel, style = MaterialTheme.typography.titleMedium)
                Text("任務產物狀態：${state.artifactStatus}", style = MaterialTheme.typography.bodyMedium)
                state.warning?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            }
        }
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("任務摘要", style = MaterialTheme.typography.titleMedium)
                if (state.summary.isEmpty()) {
                    Text("目前還沒有任務摘要。請先載入模擬任務包。")
                } else {
                    state.summary.forEach { line -> Text(line) }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilledTonalButton(onClick = onLoadMockMission, modifier = Modifier.weight(1f)) {
                Text("載入模擬任務")
            }
            OutlinedButton(onClick = onReplay, modifier = Modifier.weight(1f)) {
                Text("展示回放")
            }
        }
        FilledTonalButton(
            onClick = onGoPreflight,
            modifier = Modifier.fillMaxWidth(),
            enabled = state.bundleLoaded
        ) {
            Text("開啟飛前檢查")
        }
    }
}
