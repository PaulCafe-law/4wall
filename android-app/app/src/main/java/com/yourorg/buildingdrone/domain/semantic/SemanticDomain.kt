package com.yourorg.buildingdrone.domain.semantic

enum class BranchDecision {
    LEFT,
    RIGHT,
    STRAIGHT,
    UNKNOWN
}

data class BranchPrompt(
    val verificationPointId: String,
    val expectedOptions: Set<BranchDecision>
)
