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

@Composable
fun EmergencyScreen(
    state: EmergencyUiState,
    onCompleteLanding: () -> Unit,
    onAbortManual: () -> Unit
) {
    val bannerColor = when (state.mode) {
        EmergencyMode.HOLD -> Color(0xFF5C3D00)
        EmergencyMode.RTH -> Color(0xFF6B1F12)
        EmergencyMode.TAKEOVER -> Color(0xFF402343)
        EmergencyMode.INFO -> Color(0xFF1E2A32)
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(bannerColor)
                    .padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text("Emergency / Hold / RTH", style = MaterialTheme.typography.headlineSmall, color = Color.White)
                Text(state.reason, style = MaterialTheme.typography.titleLarge, color = Color.White)
                Text(state.nextStep, style = MaterialTheme.typography.bodyLarge, color = Color.White)
            }
        }
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Operator action", style = MaterialTheme.typography.titleMedium)
                Text("Reason and next step are always explicit. No hidden fallback behavior.")
                Text("Buttons in the bottom rail remain the primary controls throughout the mission.")
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilledTonalButton(
                onClick = onCompleteLanding,
                modifier = Modifier.weight(1f),
                enabled = state.completeLandingEnabled
            ) {
                Text(state.primaryActionLabel)
            }
            OutlinedButton(
                onClick = onAbortManual,
                modifier = Modifier.weight(1f),
                enabled = state.abortManualEnabled
            ) {
                Text(state.secondaryActionLabel)
            }
        }
    }
}
