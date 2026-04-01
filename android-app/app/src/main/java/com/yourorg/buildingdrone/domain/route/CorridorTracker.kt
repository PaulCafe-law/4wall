package com.yourorg.buildingdrone.domain.route

import com.yourorg.buildingdrone.data.CorridorSegment

enum class CorridorDeviationSeverity {
    ON_TRACK,
    WARNING,
    HARD_LIMIT
}

data class CorridorAssessment(
    val deviationMeters: Double,
    val severity: CorridorDeviationSeverity
)

class CorridorTracker {
    fun assess(segment: CorridorSegment, deviationMeters: Double): CorridorAssessment {
        val severity = when {
            deviationMeters >= segment.halfWidthMeters -> CorridorDeviationSeverity.HARD_LIMIT
            deviationMeters >= segment.halfWidthMeters * 0.75 -> CorridorDeviationSeverity.WARNING
            else -> CorridorDeviationSeverity.ON_TRACK
        }
        return CorridorAssessment(deviationMeters = deviationMeters, severity = severity)
    }
}
