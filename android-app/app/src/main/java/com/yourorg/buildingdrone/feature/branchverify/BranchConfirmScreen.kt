package com.yourorg.buildingdrone.feature.branchverify

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.yourorg.buildingdrone.ui.toStatusCopy

@Composable
fun BranchConfirmScreen(
    state: BranchVerifyUiState,
    onChooseLeft: () -> Unit,
    onChooseRight: () -> Unit,
    onChooseStraight: () -> Unit,
    onTimeout: () -> Unit,
    onHold: () -> Unit,
    onTakeover: () -> Unit
) {
    val statusCopy = state.status.toStatusCopy(MaterialTheme.colorScheme)

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Branch Confirm", style = MaterialTheme.typography.headlineSmall)
                Text(
                    "\u72c0\u614b: ${statusCopy.label}",
                    color = statusCopy.tone,
                    style = MaterialTheme.typography.titleMedium
                )
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp)
                        .background(Color(0xFF1B2328)),
                    contentAlignment = Alignment.Center
                ) {
                    Text("\u5206\u5c94\u53e3\u9810\u89bd\u756b\u9762", color = Color.White)
                }
                Text(state.confidenceLabel, style = MaterialTheme.typography.titleMedium)
                Text("\u5012\u6578 ${state.countdownSeconds} \u79d2", style = MaterialTheme.typography.bodyMedium)
                state.reason?.let { Text("\u539f\u56e0: $it", style = MaterialTheme.typography.bodyMedium) }
                Text("\u4e0b\u4e00\u6b65: ${state.nextStep}", style = MaterialTheme.typography.bodyMedium)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilledTonalButton(onClick = onChooseLeft, modifier = Modifier.weight(1f)) { Text("\u5de6") }
            FilledTonalButton(onClick = onChooseStraight, modifier = Modifier.weight(1f)) { Text("\u76f4\u884c") }
            FilledTonalButton(onClick = onChooseRight, modifier = Modifier.weight(1f)) { Text("\u53f3") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onTimeout, modifier = Modifier.weight(1f)) { Text("\u6a21\u578b\u903e\u6642") }
            OutlinedButton(onClick = onHold, modifier = Modifier.weight(1f)) { Text("\u5148 HOLD") }
            OutlinedButton(onClick = onTakeover, modifier = Modifier.weight(1f)) { Text("\u4eba\u5de5\u63a5\u7ba1") }
        }
    }
}
