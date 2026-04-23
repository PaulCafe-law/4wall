package com.yourorg.buildingdrone.feature.connection

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.yourorg.buildingdrone.ui.ConsoleBadge
import com.yourorg.buildingdrone.ui.ConsoleHeroPanel
import com.yourorg.buildingdrone.ui.ConsoleInfoRow
import com.yourorg.buildingdrone.ui.ConsoleMetricTile
import com.yourorg.buildingdrone.ui.ConsolePanel
import com.yourorg.buildingdrone.ui.toStatusCopy

@Composable
fun ConnectionGuideScreen(
    state: ConnectionGuideUiState,
    onRetry: () -> Unit,
    onContinue: () -> Unit
) {
    val statusCopy = state.status.toStatusCopy(MaterialTheme.colorScheme)

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        ConsoleHeroPanel(
            eyebrow = "connection guide",
            title = "設備連線檢查",
            statusLabel = statusCopy.label,
            statusTone = statusCopy.tone,
        ) {
            Text(
                text = state.summary,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = state.nextStep,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.68f),
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                ConsoleMetricTile(
                    label = "模式",
                    value = state.modeLabel,
                    modifier = Modifier.weight(1f),
                    accent = MaterialTheme.colorScheme.secondary,
                )
                ConsoleMetricTile(
                    label = "阻塞項",
                    value = state.blockers.size.toString(),
                    modifier = Modifier.weight(1f),
                    accent = if (state.blockers.isEmpty()) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                )
            }
        }

        ConsolePanel(
            title = "連線摘要",
            subtitle = "先確認 aircraft、RC、camera 與 mission bundle 都進入可用狀態。",
        ) {
            state.warning?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            state.fallbackNote?.let {
                ConsoleInfoRow(label = "Fallback", value = it)
            }
            if (state.blockers.isEmpty()) {
                ConsoleBadge(text = "目前沒有 blocker", tone = MaterialTheme.colorScheme.secondary)
            } else {
                state.blockers.forEach { blocker ->
                    ConsoleBadge(
                        text = blocker,
                        tone = MaterialTheme.colorScheme.tertiary,
                        background = MaterialTheme.colorScheme.tertiary.copy(alpha = 0.12f),
                    )
                }
            }
        }

        ConsolePanel(
            title = "逐項檢查",
            subtitle = "這一頁只做連線與 readiness 判斷，不進飛行控制。",
        ) {
            state.checklist.forEach { item ->
                ConsoleInfoRow(
                    label = item.label,
                    value = if (item.passed) "通過" else "待處理",
                    emphasize = true,
                    accent = if (item.passed) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.error,
                )
                Text(
                    text = item.detail,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.72f),
                )
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onRetry, modifier = Modifier.weight(1f)) {
                Text(state.retryLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            FilledTonalButton(
                onClick = onContinue,
                modifier = Modifier.weight(1f),
                enabled = state.canContinueToPreflight,
                colors = ButtonDefaults.filledTonalButtonColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                    contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                ),
            ) {
                Text(state.continueLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}
