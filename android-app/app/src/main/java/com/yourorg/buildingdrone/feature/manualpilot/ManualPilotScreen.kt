package com.yourorg.buildingdrone.feature.manualpilot

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.yourorg.buildingdrone.ui.ConsoleBadge
import com.yourorg.buildingdrone.ui.ConsoleHeroPanel
import com.yourorg.buildingdrone.ui.ConsoleInfoRow
import com.yourorg.buildingdrone.ui.ConsolePanel
import com.yourorg.buildingdrone.ui.toStatusCopy

@Composable
fun ManualPilotScreen(
    state: ManualPilotUiState,
    previewContent: @Composable (() -> Unit),
    onLeftStickChanged: (x: Float, y: Float) -> Unit,
    onLeftStickReleased: () -> Unit,
    onRightStickChanged: (x: Float, y: Float) -> Unit,
    onRightStickReleased: () -> Unit,
    onTakePhoto: () -> Unit,
    onToggleRecording: () -> Unit,
    onTiltUp: () -> Unit,
    onTiltDown: () -> Unit,
    onReturnToHome: () -> Unit,
) {
    val statusCopy = state.status.toStatusCopy(MaterialTheme.colorScheme)

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        ConsoleHeroPanel(
            eyebrow = "manual pilot",
            title = state.consoleLabel,
            statusLabel = statusCopy.label,
            statusTone = statusCopy.tone,
        ) {
            Text(
                text = state.summary,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ConsoleBadge(
                    text = "Camera ${state.cameraStreamState}",
                    tone = MaterialTheme.colorScheme.secondary,
                )
                ConsoleBadge(
                    text = "Recording ${state.recordingState}",
                    tone = if (state.recording) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.primary,
                )
            }
            Text(
                text = state.nextStep,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.68f),
            )
        }

        ConsolePanel(
            title = "即時畫面",
            subtitle = "手動飛行以相機預覽為主視覺，Stick 只做本地低速操控。",
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(300.dp)
                    .clip(RoundedCornerShape(28.dp))
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                MaterialTheme.colorScheme.surfaceVariant,
                                MaterialTheme.colorScheme.surface,
                            ),
                        ),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                previewContent()
                if (!state.previewAvailable) {
                    Text(
                        text = "目前尚未取得可用相機畫面。",
                        textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        ConsolePanel(
            title = "相機與雲台",
            subtitle = state.manualAssistHint,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilledTonalButton(
                    onClick = onTakePhoto,
                    enabled = state.canTakePhoto,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.filledTonalButtonColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer,
                        contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                    ),
                ) {
                    Text("拍照", maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                FilledTonalButton(
                    onClick = onToggleRecording,
                    enabled = state.canStartRecording || state.canStopRecording,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.filledTonalButtonColors(
                        containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                        contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
                    ),
                ) {
                    Text(if (state.recording) "停止錄影" else "開始錄影", maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = onTiltUp,
                    enabled = state.canTiltUp,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("雲台上仰", maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                OutlinedButton(
                    onClick = onTiltDown,
                    enabled = state.canTiltDown,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("雲台下俯", maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (state.canReturnToHome) {
                    OutlinedButton(
                        onClick = onReturnToHome,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("RTH", maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
            ConsoleInfoRow(
                label = "雲台角度",
                value = state.gimbalPitchLabel,
                emphasize = true,
                accent = MaterialTheme.colorScheme.secondary,
            )
            state.warning?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }

        ConsolePanel(
            title = "雙搖桿控制",
            subtitle = "離開 Manual Pilot 後會立即停止 virtual stick command stream。",
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                StickPad(
                    label = "左搖桿\nYaw / Throttle",
                    onChanged = onLeftStickChanged,
                    onReleased = onLeftStickReleased,
                    modifier = Modifier.weight(1f),
                )
                StickPad(
                    label = "右搖桿\nRoll / Pitch",
                    onChanged = onRightStickChanged,
                    onReleased = onRightStickReleased,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        if (state.telemetry.isNotEmpty()) {
            ConsolePanel(
                title = "手動飛行遙測",
                subtitle = "保留少量關鍵欄位，避免畫面過度擁擠。",
            ) {
                state.telemetry.forEach { field ->
                    ConsoleInfoRow(label = field.label, value = field.value)
                }
            }
        }
    }
}

@Composable
private fun StickPad(
    label: String,
    onChanged: (x: Float, y: Float) -> Unit,
    onReleased: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }

    Column(
        modifier = modifier.padding(horizontal = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = label,
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.76f),
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(190.dp)
                .clip(RoundedCornerShape(30.dp))
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.85f),
                            MaterialTheme.colorScheme.surface.copy(alpha = 0.98f),
                        ),
                    ),
                )
                .border(
                    width = 1.dp,
                    color = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f),
                    shape = RoundedCornerShape(30.dp),
                )
                .pointerInput(Unit) {
                    detectDragGestures(
                        onDragStart = { start ->
                            val center = Offset(size.width / 2f, size.height / 2f)
                            updateStick(
                                start = start,
                                center = center,
                                onChanged = onChanged,
                                onOffset = { x, y ->
                                    offsetX = x
                                    offsetY = y
                                },
                            )
                        },
                        onDrag = { change, _ ->
                            val center = Offset(size.width / 2f, size.height / 2f)
                            updateStick(
                                start = change.position,
                                center = center,
                                onChanged = onChanged,
                                onOffset = { x, y ->
                                    offsetX = x
                                    offsetY = y
                                },
                            )
                        },
                        onDragEnd = {
                            offsetX = 0f
                            offsetY = 0f
                            onReleased()
                        },
                        onDragCancel = {
                            offsetX = 0f
                            offsetY = 0f
                            onReleased()
                        },
                    )
                },
        ) {
            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .fillMaxWidth(0.64f)
                    .height(1.dp)
                    .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.14f)),
            )
            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .fillMaxWidth(0.01f)
                    .height(120.dp)
                    .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.14f)),
            )
            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(start = offsetX.dp, top = offsetY.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary)
                    .border(2.dp, MaterialTheme.colorScheme.surface, CircleShape)
                    .padding(22.dp),
            )
        }
    }
}

private fun updateStick(
    start: Offset,
    center: Offset,
    onChanged: (x: Float, y: Float) -> Unit,
    onOffset: (x: Float, y: Float) -> Unit,
) {
    val rawX = ((start.x - center.x) / center.x).coerceIn(-1f, 1f)
    val rawY = ((start.y - center.y) / center.y).coerceIn(-1f, 1f)
    onChanged(rawX, rawY)
    onOffset(rawX * 36f, rawY * 36f)
}
