package com.yourorg.buildingdrone.feature.preflight

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
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
fun PreflightChecklistScreen(
    state: PreflightUiState,
    onApprove: () -> Unit,
    onUploadMission: () -> Unit,
    onToggleIndoorConfirmation: (String) -> Unit,
    onAppTakeoff: () -> Unit,
    onRcHoverReady: () -> Unit,
    onLand: () -> Unit
) {
    val statusCopy = state.status.toStatusCopy(MaterialTheme.colorScheme)
    val blockerCount = state.blockers.size + if (state.propOnBlockReason != null) 1 else 0

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        ConsoleHeroPanel(
            eyebrow = "preflight gate",
            title = "起飛前檢查",
            statusLabel = statusCopy.label,
            statusTone = statusCopy.tone,
        ) {
            Text(
                text = state.operationSummary,
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
                    value = blockerCount.toString(),
                    modifier = Modifier.weight(1f),
                    accent = if (blockerCount == 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                )
            }
        }

        ConsolePanel(
            title = "檢查總覽",
            subtitle = "只有在所有必要 gate 通過後，才允許任務上傳與起飛。",
        ) {
            ConsoleInfoRow(label = "決策提示", value = state.decisionHint)
            state.autonomyStatus?.let {
                ConsoleInfoRow(label = "自治狀態", value = it)
            }
            state.warning?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            state.propOnBlockReason?.let {
                Text(
                    text = "上槳阻擋：$it",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            if (state.blockers.isEmpty() && state.propOnBlockReason == null) {
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
            subtitle = "以現場連線、任務包、模式與安全條件為準。",
        ) {
            state.checklist.forEach { item ->
                ConsoleInfoRow(
                    label = item.label,
                    value = if (item.passed) "通過" else "未通過",
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

        if (state.indoorConfirmations.isNotEmpty()) {
            ConsolePanel(
                title = "室內模式確認",
                subtitle = "室內 / 無 GPS 任務需要額外人工確認後才可繼續。",
            ) {
                state.indoorConfirmations.forEach { item ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Checkbox(
                            checked = item.checked,
                            onCheckedChange = { onToggleIndoorConfirmation(item.id) },
                        )
                        Text(item.label, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onApprove, modifier = Modifier.weight(1f)) {
                Text("重新檢查", maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            FilledTonalButton(
                onClick = onUploadMission,
                modifier = Modifier.weight(1f),
                enabled = state.readyToUpload && !state.propOnBlocked,
                colors = ButtonDefaults.filledTonalButtonColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                ),
            ) {
                Text(state.uploadActionLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }

        if (state.appTakeoffAction.visible || state.rcHoverAction.visible || state.landAction.visible) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (state.appTakeoffAction.visible) {
                    FilledTonalButton(
                        onClick = onAppTakeoff,
                        modifier = Modifier.weight(1f),
                        enabled = state.appTakeoffAction.enabled,
                        colors = ButtonDefaults.filledTonalButtonColors(
                            containerColor = MaterialTheme.colorScheme.secondaryContainer,
                            contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                        ),
                    ) {
                        Text(state.appTakeoffAction.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                if (state.rcHoverAction.visible) {
                    OutlinedButton(
                        onClick = onRcHoverReady,
                        modifier = Modifier.weight(1f),
                        enabled = state.rcHoverAction.enabled,
                    ) {
                        Text(state.rcHoverAction.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                if (state.landAction.visible) {
                    OutlinedButton(
                        onClick = onLand,
                        modifier = Modifier.weight(1f),
                        enabled = state.landAction.enabled,
                    ) {
                        Text(state.landAction.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}
