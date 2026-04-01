package com.yourorg.buildingdrone.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val BuildingDroneColors = darkColorScheme(
    primary = Color(0xFF5CC38A),
    onPrimary = Color(0xFF0D1711),
    secondary = Color(0xFFF0B14A),
    tertiary = Color(0xFFFF6B5E),
    background = Color(0xFF101315),
    surface = Color(0xFF171C1F)
)

@Composable
fun BuildingDroneTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = BuildingDroneColors,
        content = content
    )
}
