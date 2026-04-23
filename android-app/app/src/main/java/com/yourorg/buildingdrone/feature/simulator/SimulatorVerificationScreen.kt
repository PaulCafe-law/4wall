package com.yourorg.buildingdrone.feature.simulator

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
import androidx.compose.ui.unit.dp
import com.yourorg.buildingdrone.ui.ConsoleBadge
import com.yourorg.buildingdrone.ui.ConsoleHeroPanel
import com.yourorg.buildingdrone.ui.ConsoleInfoRow
import com.yourorg.buildingdrone.ui.ConsoleMetricTile
import com.yourorg.buildingdrone.ui.ConsolePanel
import com.yourorg.buildingdrone.ui.toStatusCopy

@Composable
fun SimulatorVerificationScreen(
    state: SimulatorVerificationUiState,
    onRefresh: () -> Unit,
    onEnableSimulator: () -> Unit,
    onDisableSimulator: () -> Unit,
    onRunBranchReplay: () -> Unit,
    onRunInspectionReplay: () -> Unit,
    onActivateBenchOnlyFallback: () -> Unit,
    onContinue: () -> Unit
) {
    val statusCopy = state.status.toStatusCopy(MaterialTheme.colorScheme)

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        ConsoleHeroPanel(
            eyebrow = "simulator verification",
            title = "模擬驗證",
            statusLabel = statusCopy.label,
            statusTone = statusCopy.tone,
        ) {
            Text(
                text = state.summary,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onPrimary,
            )
            Text(
                text = state.nextStep,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.78f),
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                ConsoleMetricTile(
                    label = "Simulator",
                    value = state.simulatorStatusLabel,
                    modifier = Modifier.weight(1f),
                    accent = MaterialTheme.colorScheme.secondary,
                )
                ConsoleMetricTile(
                    label = "Checklist",
                    value = "${state.checklist.count { it.passed }}/${state.checklist.size}",
                    modifier = Modifier.weight(1f),
                    accent = MaterialTheme.colorScheme.onPrimary,
                )
            }
        }

        ConsolePanel(
            title = "驗證重點",
            subtitle = "先確認 simulator、observer note 與 props-on block 是否一致。",
        ) {
            ConsoleInfoRow(label = "Observer note", value = state.observerNote)
            state.propOnBlockedReason?.let {
                Text(
                    text = "Prop-on block：$it",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            state.warning?.let {
                Text(
                    text = it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            if (state.canActivateBenchOnlyFallback && !state.benchOnlyFallbackActive) {
                OutlinedButton(
                    onClick = onActivateBenchOnlyFallback,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(state.benchOnlyFallbackLabel)
                }
            } else if (state.benchOnlyFallbackActive) {
                ConsoleBadge(text = "Bench-only fallback 已啟用", tone = MaterialTheme.colorScheme.tertiary)
            }
        }

        ConsolePanel(
            title = "檢查清單",
            subtitle = "保持模擬資料與 field protocol 的判斷一致。",
        ) {
            state.checklist.forEach { item ->
                ConsoleInfoRow(
                    label = item.label,
                    value = if (item.passed) "Passed" else "Pending",
                    emphasize = true,
                    accent = if (item.passed) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.error,
                )
                Text(
                    text = item.detail,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.74f),
                )
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = onEnableSimulator,
                modifier = Modifier.weight(1f),
                enabled = state.simulatorActionsEnabled,
            ) {
                Text(state.enableLabel)
            }
            OutlinedButton(
                onClick = onDisableSimulator,
                modifier = Modifier.weight(1f),
                enabled = state.simulatorActionsEnabled,
            ) {
                Text(state.disableLabel)
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = onRunBranchReplay,
                modifier = Modifier.weight(1f),
                enabled = state.simulatorActionsEnabled,
            ) {
                Text(state.branchReplayLabel)
            }
            OutlinedButton(
                onClick = onRunInspectionReplay,
                modifier = Modifier.weight(1f),
                enabled = state.simulatorActionsEnabled,
            ) {
                Text(state.inspectionReplayLabel)
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onRefresh, modifier = Modifier.weight(1f)) {
                Text(state.refreshLabel)
            }
            FilledTonalButton(
                onClick = onContinue,
                modifier = Modifier.weight(1f),
                enabled = state.canContinueToConnectionGuide,
                colors = ButtonDefaults.filledTonalButtonColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                    contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                ),
            ) {
                Text(state.continueLabel)
            }
        }
    }
}
