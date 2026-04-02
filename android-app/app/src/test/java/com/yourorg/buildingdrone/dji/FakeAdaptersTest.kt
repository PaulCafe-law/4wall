package com.yourorg.buildingdrone.dji

import com.yourorg.buildingdrone.core.GeoPoint
import com.yourorg.buildingdrone.data.seedMissionBundle
import com.yourorg.buildingdrone.domain.semantic.BranchDecision
import com.yourorg.buildingdrone.domain.semantic.BranchPrompt
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.io.path.createTempDirectory

class FakeAdaptersTest {
    @Test
    fun fakeWaypointMissionAdapter_requiresUploadBeforeStart() = runTest {
        val repositoryRoot = createTempDirectory(prefix = "fake-kmz").toFile()
        val bundle = seedMissionBundle(repositoryRoot)
        val adapter = FakeWaypointMissionAdapter()

        assertFalse(adapter.startMission())
        assertTrue(adapter.loadKmzMission(MissionLoadRequest(bundle.artifacts.missionKmz.localPath, bundle.missionId)).valid)
        assertTrue(adapter.uploadMission(bundle))
        assertTrue(adapter.startMission())
        assertEquals(bundle.missionId, adapter.lastUploadedMissionId())

        repositoryRoot.deleteRecursively()
    }

    @Test
    fun fakeVirtualStickAdapter_requiresEnableBeforeSend() = runTest {
        val adapter = FakeVirtualStickAdapter()

        assertFalse(adapter.send(VirtualStickCommand(throttle = 1f)))
        assertTrue(adapter.enable(VirtualStickWindow.LOCAL_AVOID))
        assertTrue(adapter.send(VirtualStickCommand(throttle = 1f)))
        assertEquals(1, adapter.commands().size)
        assertEquals(1f, adapter.commands().first().throttle)
    }

    @Test
    fun fakeCameraStreamAdapter_togglesStreamingState() = runTest {
        val adapter = FakeCameraStreamAdapter()

        assertFalse(adapter.status().streaming)
        assertTrue(adapter.start())
        assertTrue(adapter.status().streaming)
        assertTrue(adapter.stop())
        assertFalse(adapter.status().streaming)
    }

    @Test
    fun fakePerceptionAdapter_consumesQueuedResultsThenFallsBackToUnknown() = runTest {
        val adapter = FakePerceptionAdapter(listOf(BranchDecision.LEFT))
        val prompt = BranchPrompt("vp-1", setOf(BranchDecision.LEFT, BranchDecision.STRAIGHT))

        assertEquals(BranchDecision.LEFT, adapter.confirmBranch(prompt))
        assertEquals(BranchDecision.UNKNOWN, adapter.confirmBranch(prompt))
    }

    @Test
    fun fakeSimulatorAdapter_publishesStateChanges() = runTest {
        val adapter = FakeSimulatorAdapter()

        assertTrue(adapter.enable(GeoPoint(25.0, 121.0), 10.0))
        assertTrue(adapter.status().enabled)
        assertTrue(adapter.disable())
        assertFalse(adapter.status().enabled)
    }
}
