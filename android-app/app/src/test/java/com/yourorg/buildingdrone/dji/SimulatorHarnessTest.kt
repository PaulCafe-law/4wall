package com.yourorg.buildingdrone.dji

import com.yourorg.buildingdrone.core.GeoPoint
import com.yourorg.buildingdrone.dji.real.DjiSimulatorAdapter
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SimulatorHarnessTest {
    @Test
    fun simulatorHarness_replaysEnableDisableAndStateUpdates() = runTest {
        var publishedStatus = SimulatorStatus()
        val adapter = DjiSimulatorAdapter(
            gateway = object : DjiSimulatorAdapter.Gateway {
                private var listener: ((SimulatorStatus) -> Unit)? = null

                override fun isEnabled(): Boolean = publishedStatus.enabled

                override fun addListener(listener: (SimulatorStatus) -> Unit) {
                    this.listener = listener
                }

                override fun enable(initialLocation: GeoPoint, altitudeMeters: Double, callback: dji.v5.common.callback.CommonCallbacks.CompletionCallback) {
                    publishedStatus = SimulatorStatus(enabled = true, location = initialLocation, altitudeMeters = altitudeMeters, satelliteCount = 12)
                    listener?.invoke(publishedStatus)
                    callback.onSuccess()
                }

                override fun disable(callback: dji.v5.common.callback.CommonCallbacks.CompletionCallback) {
                    publishedStatus = SimulatorStatus()
                    listener?.invoke(publishedStatus)
                    callback.onSuccess()
                }
            }
        )

        var lastStatus = adapter.status()
        adapter.addStateListener("test") { lastStatus = it }

        assertTrue(adapter.enable(GeoPoint(25.0, 121.0), 15.0))
        assertTrue(lastStatus.enabled)
        assertEquals(15.0, lastStatus.altitudeMeters, 0.0)

        assertTrue(adapter.disable())
        assertFalse(lastStatus.enabled)
    }
}
