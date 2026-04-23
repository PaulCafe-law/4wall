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
import com.yourorg.buildingdrone.ui.toStatusCopy

@Composable
fun InspectionCaptureScreen(
    state: InspectionCaptureUiState,
    onAlign: () -> Unit,
    onCapture: () -> Unit,
    onHold: () -> Unit
) {
    val statusCopy = state.captureStatus.toStatusCopy(MaterialTheme.colorScheme)

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("巡檢拍攝", style = MaterialTheme.typography.headlineSmall)
                Text(
                    "狀態：${statusCopy.label}",
                    color = statusCopy.tone,
                    style = MaterialTheme.typography.titleMedium
                )
                Text(state.viewpointLabel, style = MaterialTheme.typography.titleMedium)
                Text(state.alignmentStatus, style = MaterialTheme.typography.bodyLarge)
                state.reason?.let { Text("原因：$it", style = MaterialTheme.typography.bodyMedium) }
                Text("下一步：${state.nextStep}", style = MaterialTheme.typography.bodyMedium)
            }
        }
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("取景提示", style = MaterialTheme.typography.titleMedium)
                if (state.framingHints.isEmpty()) {
                    Text("尚未取得取景提示，請先完成靠近與對正。", style = MaterialTheme.typography.bodyMedium)
                } else {
                    state.framingHints.forEach { hint -> Text(hint, style = MaterialTheme.typography.bodyMedium) }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = onAlign,
                modifier = Modifier.weight(1f),
                enabled = !state.captureEnabled
            ) {
                Text("對正畫面")
            }
            FilledTonalButton(
                onClick = onCapture,
                modifier = Modifier.weight(1f),
                enabled = state.captureEnabled
            ) {
                Text("拍攝")
            }
            OutlinedButton(onClick = onHold, modifier = Modifier.weight(1f)) { Text("先保持") }
        }
    }
}
