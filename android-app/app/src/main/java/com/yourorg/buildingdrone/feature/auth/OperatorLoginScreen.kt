package com.yourorg.buildingdrone.feature.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

@Composable
fun OperatorLoginScreen(
    username: String,
    password: String,
    loading: Boolean,
    error: String?,
    onUsernameChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onLogin: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("\u64cd\u4f5c\u54e1\u767b\u5165", style = MaterialTheme.typography.headlineSmall)
                Text("Prod mode \u9700\u8981\u6709\u6548\u7684 operator token\uff0c\u767b\u5165\u5f8c\u624d\u80fd\u540c\u6b65 mission bundle\u3002")
                OutlinedTextField(
                    value = username,
                    onValueChange = onUsernameChange,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("\u5e33\u865f") },
                    singleLine = true,
                    enabled = !loading
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = onPasswordChange,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("\u5bc6\u78bc") },
                    singleLine = true,
                    enabled = !loading,
                    visualTransformation = PasswordVisualTransformation()
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                FilledTonalButton(
                    onClick = onLogin,
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !loading && username.isNotBlank() && password.isNotBlank()
                ) {
                    Text(
                        if (loading) "\u767b\u5165\u4e2d"
                        else "\u767b\u5165\u4e26\u9032\u5165\u98db\u884c\u63a7\u5236\u53f0"
                    )
                }
            }
        }
    }
}
