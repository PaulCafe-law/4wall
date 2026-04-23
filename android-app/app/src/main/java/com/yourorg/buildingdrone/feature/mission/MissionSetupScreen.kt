package com.yourorg.buildingdrone.feature.mission

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.yourorg.buildingdrone.domain.operations.OperatorConsoleMode
import com.yourorg.buildingdrone.ui.ConsoleBadge
import com.yourorg.buildingdrone.ui.ConsoleHeroPanel
import com.yourorg.buildingdrone.ui.ConsoleInfoRow
import com.yourorg.buildingdrone.ui.ConsolePanel
import com.yourorg.buildingdrone.ui.toStatusCopy

@Composable
fun MissionSetupScreen(
    state: MissionSetupUiState,
    onLoadMockMission: () -> Unit,
    onReplay: () -> Unit,
    onGoPreflight: () -> Unit,
    onSelectConsoleMode: (OperatorConsoleMode) -> Unit,
) {
    val statusCopy = state.status.toStatusCopy(MaterialTheme.colorScheme)

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        ConsoleHeroPanel(
            eyebrow = "mission setup",
            title = state.missionLabel,
            statusLabel = statusCopy.label,
            statusTone = statusCopy.tone,
        ) {
            Text(
                text = state.nextStep,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = state.artifactStatus,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.68f),
            )
            state.authStatus?.let {
                ConsoleBadge(
                    text = it,
                    tone = MaterialTheme.colorScheme.secondary,
                    background = MaterialTheme.colorScheme.secondary.copy(alpha = 0.1f),
                    contentColor = MaterialTheme.colorScheme.secondary,
                )
            }
        }

        ConsolePanel(
            title = "執行模式",
            subtitle = "先決定這次任務用哪一種 console，再進入下一頁。",
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OperatorConsoleMode.entries.forEach { mode ->
                    FilterChip(
                        selected = state.selectedConsoleMode == mode,
                        onClick = { onSelectConsoleMode(mode) },
                        enabled = !state.selectionLocked,
                        label = {
                            Text(
                                text = mode.displayLabel,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                            selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer,
                            containerColor = MaterialTheme.colorScheme.surfaceVariant,
                            labelColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        ),
                    )
                }
            }
            Text(
                text = state.selectedConsoleMode.detail,
                style = MaterialTheme.typography.bodyMedium,
            )
            ConsoleInfoRow(
                label = "Planned profile",
                value = state.plannedOperatingProfile?.displayLabel ?: "未提供",
            )
            ConsoleInfoRow(
                label = "Executed profile",
                value = "${state.selectedOperatingProfile.displayLabel} / ${state.selectedExecutionMode.displayLabel}",
                emphasize = true,
                accent = MaterialTheme.colorScheme.primary,
            )
            ConsoleInfoRow(
                label = "自治狀態",
                value = state.autonomyStatus,
            )
            if (state.selectionLocked) {
                ConsoleBadge(
                    text = "模式已鎖定，若要更改請回到 Mission Setup",
                    tone = MaterialTheme.colorScheme.tertiary,
                )
            }
            state.profileMismatchWarning?.let {
                Text(
                    text = it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }

        ConsolePanel(
            title = "任務摘要",
            subtitle = "同步完成後，bundle 與本機執行資料會在這裡顯示。",
        ) {
            if (state.summary.isEmpty()) {
                Text(
                    text = "目前尚未取得可用任務包。",
                    style = MaterialTheme.typography.bodyMedium,
                )
            } else {
                state.summary.forEach { line ->
                    Text(
                        text = "• $line",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
            state.warning?.let {
                Text(
                    text = it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilledTonalButton(
                onClick = onLoadMockMission,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.filledTonalButtonColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                ),
            ) {
                Text(state.loadActionLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            OutlinedButton(
                onClick = onReplay,
                modifier = Modifier.weight(1f),
            ) {
                Text("回放遙測", maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }

        FilledTonalButton(
            onClick = onGoPreflight,
            modifier = Modifier.fillMaxWidth(),
            enabled = state.bundleLoaded,
            colors = ButtonDefaults.filledTonalButtonColors(
                containerColor = MaterialTheme.colorScheme.secondaryContainer,
                contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
            ),
        ) {
            Text(state.continueLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}
