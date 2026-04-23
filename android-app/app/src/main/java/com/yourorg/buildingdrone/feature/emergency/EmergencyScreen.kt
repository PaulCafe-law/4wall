package com.yourorg.buildingdrone.feature.emergency

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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.yourorg.buildingdrone.ui.ConsoleHeroPanel
import com.yourorg.buildingdrone.ui.ConsoleInfoRow
import com.yourorg.buildingdrone.ui.ConsolePanel
import com.yourorg.buildingdrone.ui.toStatusCopy

@Composable
fun EmergencyScreen(
    state: EmergencyUiState,
    onPrimaryAction: () -> Unit,
    onSecondaryAction: () -> Unit
) {
    val bannerColor = when (state.mode) {
        EmergencyMode.HOLD -> Color(0xFFB97B30)
        EmergencyMode.RTH -> Color(0xFFBA6A57)
        EmergencyMode.TAKEOVER -> Color(0xFF786B9E)
        EmergencyMode.INFO -> MaterialTheme.colorScheme.secondary
    }
    val statusCopy = state.status.toStatusCopy(MaterialTheme.colorScheme)

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        ConsoleHeroPanel(
            eyebrow = "safety center",
            title = "安全決策中心",
            statusLabel = statusCopy.label,
            statusTone = bannerColor,
        ) {
            Text(
                text = state.reason,
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = state.nextStep,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
            )
        }

        ConsolePanel(
            title = "操作規則",
            subtitle = "任何不確定狀況一律先 HOLD，再決定是否降落、返航或人工接管。",
        ) {
            Text(state.operatorHint, style = MaterialTheme.typography.bodyMedium)
            ConsoleInfoRow(
                label = "下一步",
                value = state.nextStep,
                emphasize = true,
                accent = bannerColor,
            )
            ConsoleInfoRow(label = "Secondary action", value = state.secondaryActionLabel)
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilledTonalButton(
                onClick = onPrimaryAction,
                modifier = Modifier.weight(1f),
                enabled = state.primaryActionEnabled,
                colors = ButtonDefaults.filledTonalButtonColors(
                    containerColor = bannerColor.copy(alpha = 0.16f),
                    contentColor = bannerColor,
                ),
            ) {
                Text(state.primaryActionLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            OutlinedButton(
                onClick = onSecondaryAction,
                modifier = Modifier.weight(1f),
                enabled = state.secondaryActionEnabled,
            ) {
                Text(state.secondaryActionLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}
