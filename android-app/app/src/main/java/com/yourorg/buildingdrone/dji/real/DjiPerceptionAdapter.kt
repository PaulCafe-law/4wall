package com.yourorg.buildingdrone.dji.real

import com.yourorg.buildingdrone.dji.PerceptionAdapter
import com.yourorg.buildingdrone.dji.PerceptionSnapshot
import com.yourorg.buildingdrone.domain.semantic.BranchDecision
import com.yourorg.buildingdrone.domain.semantic.BranchPrompt
import dji.v5.manager.aircraft.perception.PerceptionManager
import dji.v5.manager.aircraft.perception.data.ObstacleData
import dji.v5.manager.aircraft.perception.data.PerceptionInfo

class DjiPerceptionAdapter(
    private val gateway: Gateway = RealGateway()
) : PerceptionAdapter {
    interface Gateway {
        fun start(
            onPerceptionInfo: (PerceptionInfo) -> Unit,
            onObstacleData: (ObstacleData) -> Unit
        )
    }

    private val listeners = linkedMapOf<String, (PerceptionSnapshot) -> Unit>()
    private var snapshot = PerceptionSnapshot()
    private var started = false

    override fun currentSnapshot(): PerceptionSnapshot {
        ensureStarted()
        return snapshot
    }

    override fun addObstacleListener(listenerId: String, listener: (PerceptionSnapshot) -> Unit) {
        ensureStarted()
        listeners[listenerId] = listener
    }

    override fun removeObstacleListener(listenerId: String) {
        listeners.remove(listenerId)
    }

    override suspend fun confirmBranch(prompt: BranchPrompt): BranchDecision {
        return BranchDecision.UNKNOWN
    }

    private fun ensureStarted() {
        if (started) {
            return
        }
        started = true
        gateway.start(
            onPerceptionInfo = { info ->
                snapshot = snapshot.copy(
                    obstacleDetected = snapshot.obstacleDetected,
                    hardStopRequired = snapshot.hardStopRequired,
                    summary = info.toString()
                )
                publish()
            },
            onObstacleData = { data ->
                snapshot = PerceptionSnapshot(
                    obstacleDetected = true,
                    hardStopRequired = true,
                    summary = data.toString()
                )
                publish()
            }
        )
    }

    private fun publish() {
        listeners.values.forEach { it(snapshot) }
    }

    private class RealGateway : Gateway {
        private val perceptionManager = PerceptionManager.getInstance()

        override fun start(
            onPerceptionInfo: (PerceptionInfo) -> Unit,
            onObstacleData: (ObstacleData) -> Unit
        ) {
            perceptionManager.addPerceptionInformationListener(onPerceptionInfo)
            perceptionManager.addObstacleDataListener(onObstacleData)
        }
    }
}
