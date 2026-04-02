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
                Text("Inspection Capture", style = MaterialTheme.typography.headlineSmall)
                Text(
                    "\u72c0\u614b: ${statusCopy.label}",
                    color = statusCopy.tone,
                    style = MaterialTheme.typography.titleMedium
                )
                Text(state.viewpointLabel, style = MaterialTheme.typography.titleMedium)
                Text(state.alignmentStatus, style = MaterialTheme.typography.bodyLarge)
                state.reason?.let { Text("\u539f\u56e0: $it", style = MaterialTheme.typography.bodyMedium) }
                Text("\u4e0b\u4e00\u6b65: ${state.nextStep}", style = MaterialTheme.typography.bodyMedium)
            }
        }
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("\u53d6\u666f\u63d0\u793a", style = MaterialTheme.typography.titleMedium)
                if (state.framingHints.isEmpty()) {
                    Text(
                        "\u5c1a\u672a\u53d6\u5f97 framing hints\uff0c\u8acb\u5148\u5b8c\u6210\u9760\u8fd1\u8207\u5c0d\u6b63\u3002",
                        style = MaterialTheme.typography.bodyMedium
                    )
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
                Text("Align View")
            }
            FilledTonalButton(
                onClick = onCapture,
                modifier = Modifier.weight(1f),
                enabled = state.captureEnabled
            ) {
                Text("Capture")
            }
            OutlinedButton(onClick = onHold, modifier = Modifier.weight(1f)) { Text("\u5148 HOLD") }
        }
    }
}
