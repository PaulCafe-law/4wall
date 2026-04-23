package com.yourorg.buildingdrone.feature.transit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.yourorg.buildingdrone.ui.ConsoleBadge
import com.yourorg.buildingdrone.ui.ConsoleHeroPanel
import com.yourorg.buildingdrone.ui.ConsoleInfoRow
import com.yourorg.buildingdrone.ui.ConsolePanel
import com.yourorg.buildingdrone.ui.toStatusCopy

@Composable
fun InFlightMainScreen(
    state: TransitUiState,
) {
    val statusCopy = state.status.toStatusCopy(MaterialTheme.colorScheme)
    val progressValue = when {
        state.isCompleted -> 1f
        state.isHold -> 0.55f
        else -> 0.72f
    }

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        ConsoleHeroPanel(
            eyebrow = "main transit",
            title = state.stateLabel,
            statusLabel = statusCopy.label,
            statusTone = statusCopy.tone,
        ) {
            Text(
                text = state.progressLabel,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            LinearProgressIndicator(
                progress = { progressValue },
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colorScheme.primary,
                trackColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
            )
            Text(
                text = state.nextStep,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.68f),
            )
        }

        ConsolePanel(
            title = "航段監控",
            subtitle = "主航段只呈現當前飛行狀態與風險提示，不做額外規劃操作。",
        ) {
            ConsoleInfoRow(label = "航段狀態", value = statusCopy.label, emphasize = true, accent = statusCopy.tone)
            ConsoleInfoRow(label = "進度", value = state.progressLabel)
            ConsoleInfoRow(label = "下一步", value = state.nextStep)
            state.riskReason?.let {
                ConsoleBadge(
                    text = it,
                    tone = MaterialTheme.colorScheme.tertiary,
                    background = MaterialTheme.colorScheme.tertiary.copy(alpha = 0.12f),
                )
            }
            state.partialWarning?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.72f),
                )
            }
        }

        ConsolePanel(
            title = "即時遙測",
            subtitle = "保留關鍵飛行欄位，不讓畫面被零散卡片撐亂。",
        ) {
            if (state.telemetry.isEmpty()) {
                Text("目前尚未收到 flight telemetry。", style = MaterialTheme.typography.bodyMedium)
            } else {
                state.telemetry.forEach { field ->
                    ConsoleInfoRow(label = field.label, value = field.value)
                }
            }
        }
    }
}
