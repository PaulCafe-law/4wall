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
        ): Boolean
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
        started = gateway.start(
            onPerceptionInfo = { info ->
                snapshot = snapshot.copy(
                    obstacleDetected = snapshot.obstacleDetected,
                    hardStopRequired = snapshot.hardStopRequired,
                    summary = summarizePerceptionInfo(info)
                )
                publish()
            },
            onObstacleData = { data ->
                snapshot = PerceptionSnapshot(
                    obstacleDetected = true,
                    hardStopRequired = true,
                    summary = summarizeObstacleData(data)
                )
                publish()
            }
        )
    }

    private fun publish() {
        listeners.values.forEach { it(snapshot) }
    }

    private fun summarizePerceptionInfo(info: PerceptionInfo): String? {
        val raw = info.toString()
        return when {
            raw.contains("BRAKE", ignoreCase = true) -> "本地感知要求立即減速或停止，請勿直接降落。"
            raw.contains("WARNING", ignoreCase = true) -> "本地感知偵測到降落區附近可能有障礙。"
            raw.contains("AVOID", ignoreCase = true) -> "本地感知建議先避開障礙，再重新評估降落。"
            else -> "本地感知判定目前不適合直接降落。"
        }
    }

    private fun summarizeObstacleData(data: ObstacleData): String {
        val raw = data.toString()
        return when {
            raw.contains("horizontalObstacleDistance", ignoreCase = true) ->
                "本地感知偵測到降落區附近有障礙，請先確認周圍環境。"

            else ->
                "本地感知偵測到降落區異常，請先確認下方環境。"
        }
    }

    private class RealGateway : Gateway {
        override fun start(
            onPerceptionInfo: (PerceptionInfo) -> Unit,
            onObstacleData: (ObstacleData) -> Unit
        ): Boolean = runCatching {
            val perceptionManager = PerceptionManager.getInstance()
            perceptionManager.addPerceptionInformationListener(onPerceptionInfo)
            perceptionManager.addObstacleDataListener(onObstacleData)
            true
        }.getOrDefault(false)
    }
}
