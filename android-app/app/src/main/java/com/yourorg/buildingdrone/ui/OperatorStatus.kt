package com.yourorg.buildingdrone.ui

import androidx.compose.material3.ColorScheme
import androidx.compose.ui.graphics.Color

data class StatusCopy(
    val label: String,
    val tone: Color
)

fun ScreenDataState.toStatusCopy(colorScheme: ColorScheme): StatusCopy {
    return when (this) {
        ScreenDataState.LOADING -> StatusCopy("Loading", colorScheme.primary)
        ScreenDataState.EMPTY -> StatusCopy("Idle", colorScheme.outline)
        ScreenDataState.ERROR -> StatusCopy("Blocked", colorScheme.error)
        ScreenDataState.SUCCESS -> StatusCopy("Passed", colorScheme.primary)
        ScreenDataState.PARTIAL -> StatusCopy("Needs Review", Color(0xFF8A5A00))
    }
}
