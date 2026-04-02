package com.yourorg.buildingdrone.ui

import androidx.compose.material3.ColorScheme
import androidx.compose.ui.graphics.Color

data class StatusCopy(
    val label: String,
    val tone: Color
)

fun ScreenDataState.toStatusCopy(colorScheme: ColorScheme): StatusCopy {
    return when (this) {
        ScreenDataState.LOADING -> StatusCopy("載入中", colorScheme.primary)
        ScreenDataState.EMPTY -> StatusCopy("待命", colorScheme.outline)
        ScreenDataState.ERROR -> StatusCopy("阻塞", colorScheme.error)
        ScreenDataState.SUCCESS -> StatusCopy("就緒", colorScheme.primary)
        ScreenDataState.PARTIAL -> StatusCopy("需人工確認", Color(0xFF8A5A00))
    }
}
