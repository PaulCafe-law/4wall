package com.yourorg.buildingdrone.dji.real

import android.app.Application
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DjiSdkSessionTest {
    @Test
    fun initialize_reportsExplicitErrorWhenManifestKeyMissing() {
        val gateway = RecordingGateway()
        val session = DjiSdkSession(
            gateway = gateway,
            manifestApiKeyProvider = { "MISSING_DJI_API_KEY" }
        )

        session.initialize(Application())

        assertEquals(0, gateway.initCalls)
        assertFalse(session.state.value.initialized)
        assertFalse(session.state.value.registered)
        assertTrue(session.state.value.lastError?.contains("DJI App Key is missing") == true)
    }

    @Test
    fun retryRegistration_retriesAfterInitializationCompletes() {
        val gateway = RecordingGateway(
            onInit = { callback ->
                callback.onInitProcess(true, 100)
            }
        )
        val session = DjiSdkSession(
            gateway = gateway,
            manifestApiKeyProvider = { "real-key" }
        )

        session.initialize(Application())
        session.retryRegistration()

        assertEquals(1, gateway.initCalls)
        assertEquals(2, gateway.registerCalls)
    }

    private class RecordingGateway(
        private val onInit: ((DjiSdkSession.Callback) -> Unit)? = null
    ) : DjiSdkSession.Gateway {
        var initCalls: Int = 0
        var registerCalls: Int = 0
        var registered: Boolean = false

        override fun init(application: Application, callback: DjiSdkSession.Callback) {
            initCalls += 1
            onInit?.invoke(callback)
        }

        override fun destroy() = Unit

        override fun registerApp() {
            registerCalls += 1
        }

        override fun isRegistered(): Boolean = registered

        override fun addNetworkStatusListener(listener: (Boolean) -> Unit) = Unit

        override fun removeNetworkStatusListener() = Unit
    }
}
