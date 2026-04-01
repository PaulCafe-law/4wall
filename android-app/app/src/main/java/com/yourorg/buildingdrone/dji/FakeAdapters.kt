package com.yourorg.buildingdrone.dji

import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.domain.semantic.BranchDecision
import com.yourorg.buildingdrone.domain.semantic.BranchPrompt
import java.util.ArrayDeque

class FakeWaypointMissionAdapter : WaypointMissionAdapter {
    var lastUploadedMissionId: String? = null
        private set
    var started: Boolean = false
        private set

    override suspend fun uploadMission(missionBundle: MissionBundle): Boolean {
        lastUploadedMissionId = missionBundle.missionId
        return true
    }

    override suspend fun startMission(): Boolean {
        started = lastUploadedMissionId != null
        return started
    }

    override suspend fun stopMission(): Boolean {
        started = false
        return true
    }
}

class FakeVirtualStickAdapter : VirtualStickAdapter {
    private val sentCommands = mutableListOf<VirtualStickCommand>()

    override suspend fun send(command: VirtualStickCommand): Boolean {
        sentCommands += command
        return true
    }

    fun commands(): List<VirtualStickCommand> = sentCommands.toList()
}

class FakeCameraStreamAdapter : CameraStreamAdapter {
    private var streaming = false

    override fun isStreaming(): Boolean = streaming

    override suspend fun start(): Boolean {
        streaming = true
        return true
    }

    override suspend fun stop(): Boolean {
        streaming = false
        return true
    }
}

class FakePerceptionAdapter(
    decisions: List<BranchDecision> = listOf(BranchDecision.STRAIGHT)
) : PerceptionAdapter {
    private val queuedDecisions = ArrayDeque(decisions)

    override suspend fun confirmBranch(prompt: BranchPrompt): BranchDecision {
        return if (queuedDecisions.isEmpty()) {
            BranchDecision.UNKNOWN
        } else {
            queuedDecisions.removeFirst()
        }
    }

    fun enqueue(decision: BranchDecision) {
        queuedDecisions.addLast(decision)
    }
}
