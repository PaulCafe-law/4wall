package com.yourorg.buildingdrone.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp

private val BuildingDroneColors = lightColorScheme(
    primary = Color(0xFF9C5C3C),
    onPrimary = Color(0xFFFFF8F4),
    primaryContainer = Color(0xFFEBCDBE),
    onPrimaryContainer = Color(0xFF412112),
    secondary = Color(0xFF5F7084),
    onSecondary = Color(0xFFF8FAFC),
    secondaryContainer = Color(0xFFD8E0EA),
    onSecondaryContainer = Color(0xFF213040),
    tertiary = Color(0xFFB85D52),
    onTertiary = Color(0xFFFFF8F7),
    tertiaryContainer = Color(0xFFF3D1CC),
    onTertiaryContainer = Color(0xFF4A1F19),
    error = Color(0xFFB64B4B),
    onError = Color(0xFFFFFBFA),
    background = Color(0xFFF6F2EC),
    onBackground = Color(0xFF261F1A),
    surface = Color(0xFFFFFCF8),
    onSurface = Color(0xFF2A231D),
    surfaceVariant = Color(0xFFEEE6DA),
    onSurfaceVariant = Color(0xFF5B5045),
    outline = Color(0xFFD5C9BC),
    outlineVariant = Color(0xFFE7DDD2),
)

private val BuildingDroneShapes = Shapes(
    small = RoundedCornerShape(16.dp),
    medium = RoundedCornerShape(22.dp),
    large = RoundedCornerShape(28.dp),
    extraLarge = RoundedCornerShape(34.dp),
)

@Composable
fun BuildingDroneTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = BuildingDroneColors,
        shapes = BuildingDroneShapes,
        content = content
    )
}
