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
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("岔路確認", style = MaterialTheme.typography.headlineSmall)
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp)
                        .background(Color(0xFF1B2328)),
                    contentAlignment = Alignment.Center
                ) {
                    Text("模擬相機畫面", color = Color.White)
                }
                Text(state.confidenceLabel, style = MaterialTheme.typography.titleMedium)
                Text("倒數：${state.countdownSeconds} 秒", style = MaterialTheme.typography.bodyMedium)
                state.reason?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilledTonalButton(onClick = onChooseLeft, modifier = Modifier.weight(1f)) { Text("左轉") }
            FilledTonalButton(onClick = onChooseStraight, modifier = Modifier.weight(1f)) { Text("直行") }
            FilledTonalButton(onClick = onChooseRight, modifier = Modifier.weight(1f)) { Text("右轉") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onTimeout, modifier = Modifier.weight(1f)) { Text("逾時") }
            OutlinedButton(onClick = onHold, modifier = Modifier.weight(1f)) { Text("懸停") }
            OutlinedButton(onClick = onTakeover, modifier = Modifier.weight(1f)) { Text("接管") }
        }
    }
}
