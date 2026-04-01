package com.yourorg.buildingdrone.dji

import com.yourorg.buildingdrone.data.demoMissionBundle
import com.yourorg.buildingdrone.domain.semantic.BranchDecision
import com.yourorg.buildingdrone.domain.semantic.BranchPrompt
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FakeAdaptersTest {
    @Test
    fun fakeWaypointMissionAdapter_requiresUploadBeforeStart() = runTest {
        val adapter = FakeWaypointMissionAdapter()

        assertFalse(adapter.startMission())
        assertTrue(adapter.uploadMission(demoMissionBundle()))
        assertTrue(adapter.startMission())
        assertEquals("demo-mission-001", adapter.lastUploadedMissionId)
    }

    @Test
    fun fakeVirtualStickAdapter_recordsCommands() = runTest {
        val adapter = FakeVirtualStickAdapter()

        adapter.send(VirtualStickCommand(throttle = 1f))

        assertEquals(1, adapter.commands().size)
        assertEquals(1f, adapter.commands().first().throttle)
    }

    @Test
    fun fakeCameraStreamAdapter_togglesStreamingState() = runTest {
        val adapter = FakeCameraStreamAdapter()

        assertFalse(adapter.isStreaming())
        assertTrue(adapter.start())
        assertTrue(adapter.isStreaming())
        assertTrue(adapter.stop())
        assertFalse(adapter.isStreaming())
    }

    @Test
    fun fakePerceptionAdapter_consumesQueuedResultsThenFallsBackToUnknown() = runTest {
        val adapter = FakePerceptionAdapter(listOf(BranchDecision.LEFT))
        val prompt = BranchPrompt("vp-1", setOf(BranchDecision.LEFT, BranchDecision.STRAIGHT))

        assertEquals(BranchDecision.LEFT, adapter.confirmBranch(prompt))
        assertEquals(BranchDecision.UNKNOWN, adapter.confirmBranch(prompt))
    }
}
