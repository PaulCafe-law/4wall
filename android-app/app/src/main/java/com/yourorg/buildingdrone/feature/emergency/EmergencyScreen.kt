package com.yourorg.buildingdrone.feature.emergency

import androidx.compose.foundation.background
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.yourorg.buildingdrone.ui.toStatusCopy

@Composable
fun EmergencyScreen(
    state: EmergencyUiState,
    onPrimaryAction: () -> Unit,
    onSecondaryAction: () -> Unit
) {
    val bannerColor = when (state.mode) {
        EmergencyMode.HOLD -> Color(0xFF5C3D00)
        EmergencyMode.RTH -> Color(0xFF6B1F12)
        EmergencyMode.TAKEOVER -> Color(0xFF402343)
        EmergencyMode.INFO -> Color(0xFF1E2A32)
    }
    val statusCopy = state.status.toStatusCopy(MaterialTheme.colorScheme)

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(bannerColor)
                    .padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text("\u5b89\u5168\u6c7a\u7b56\u4e2d\u5fc3", style = MaterialTheme.typography.headlineSmall, color = Color.White)
                Text("\u72c0\u614b: ${statusCopy.label}", style = MaterialTheme.typography.titleMedium, color = Color.White)
                Text("\u505c\u4f4f\u539f\u56e0: ${state.reason}", style = MaterialTheme.typography.titleLarge, color = Color.White)
                Text("\u4e0b\u4e00\u6b65: ${state.nextStep}", style = MaterialTheme.typography.bodyLarge, color = Color.White)
            }
        }
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("\u64cd\u4f5c\u898f\u5247", style = MaterialTheme.typography.titleMedium)
                Text(state.operatorHint, style = MaterialTheme.typography.bodyMedium)
                Text(
                    "\u82e5\u7121\u6cd5\u78ba\u5b9a\u662f\u5426\u53ef\u5b89\u5168\u6062\u5fa9\u81ea\u4e3b\u98db\u884c\uff0c\u4fdd\u6301 HOLD\uff0c\u4e26\u6539\u7531 RTH \u6216\u4eba\u5de5\u63a5\u7ba1\u7d50\u675f\u7576\u524d\u6d41\u7a0b\u3002",
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilledTonalButton(
                onClick = onPrimaryAction,
                modifier = Modifier.weight(1f),
                enabled = state.primaryActionEnabled
            ) {
                Text(state.primaryActionLabel)
            }
            OutlinedButton(
                onClick = onSecondaryAction,
                modifier = Modifier.weight(1f),
                enabled = state.secondaryActionEnabled
            ) {
                Text(state.secondaryActionLabel)
            }
        }
    }
}
