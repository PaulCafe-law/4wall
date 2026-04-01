package com.yourorg.buildingdrone.dji

import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.domain.semantic.BranchDecision
import com.yourorg.buildingdrone.domain.semantic.BranchPrompt

data class VirtualStickCommand(
    val pitch: Float = 0f,
    val roll: Float = 0f,
    val yaw: Float = 0f,
    val throttle: Float = 0f
)

interface WaypointMissionAdapter {
    suspend fun uploadMission(missionBundle: MissionBundle): Boolean
    suspend fun startMission(): Boolean
    suspend fun stopMission(): Boolean
}

interface VirtualStickAdapter {
    suspend fun send(command: VirtualStickCommand): Boolean
}

interface CameraStreamAdapter {
    fun isStreaming(): Boolean
    suspend fun start(): Boolean
    suspend fun stop(): Boolean
}

interface PerceptionAdapter {
    suspend fun confirmBranch(prompt: BranchPrompt): BranchDecision
}
