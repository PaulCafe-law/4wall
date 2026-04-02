package com.yourorg.buildingdrone.dji.real

import android.app.Application
import com.yourorg.buildingdrone.dji.MobileSdkSession
import com.yourorg.buildingdrone.dji.SdkSessionState
import dji.v5.common.error.IDJIError
import dji.v5.common.register.DJISDKInitEvent
import dji.v5.manager.SDKManager
import dji.v5.manager.interfaces.SDKManagerCallback
import dji.v5.network.DJINetworkManager
import dji.v5.network.IDJINetworkStatusListener
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class DjiSdkSession(
    private val gateway: Gateway = RealGateway()
) : MobileSdkSession {
    interface Gateway {
        fun init(application: Application, callback: Callback)
        fun destroy()
        fun registerApp()
        fun isRegistered(): Boolean
        fun addNetworkStatusListener(listener: (Boolean) -> Unit)
        fun removeNetworkStatusListener()
    }

    interface Callback {
        fun onRegisterSuccess()
        fun onRegisterFailure(error: IDJIError)
        fun onInitProcess(initializationComplete: Boolean, totalProcess: Int)
    }

    private val mutableState = MutableStateFlow(SdkSessionState())
    private var initialized = false

    override val state: StateFlow<SdkSessionState> = mutableState.asStateFlow()

    override fun initialize(application: Application) {
        if (initialized) {
            return
        }
        initialized = true
        gateway.init(application, object : Callback {
            override fun onRegisterSuccess() {
                mutableState.value = mutableState.value.copy(registered = true, lastError = null)
            }

            override fun onRegisterFailure(error: IDJIError) {
                mutableState.value = mutableState.value.copy(registered = false, lastError = error.toString())
            }

            override fun onInitProcess(initializationComplete: Boolean, totalProcess: Int) {
                mutableState.value = mutableState.value.copy(
                    initialized = initializationComplete || mutableState.value.initialized,
                    initProgress = totalProcess
                )
                if (initializationComplete && !gateway.isRegistered()) {
                    gateway.registerApp()
                }
            }
        })
        gateway.addNetworkStatusListener { isAvailable ->
            mutableState.value = mutableState.value.copy(networkAvailable = isAvailable)
            if (isAvailable && !gateway.isRegistered()) {
                gateway.registerApp()
            }
        }
    }

    override fun destroy() {
        gateway.removeNetworkStatusListener()
        gateway.destroy()
    }

    private class RealGateway : Gateway {
        private var networkListener: IDJINetworkStatusListener? = null

        override fun init(application: Application, callback: Callback) {
            SDKManager.getInstance().init(application, object : SDKManagerCallback {
                override fun onRegisterSuccess() = callback.onRegisterSuccess()

                override fun onRegisterFailure(error: IDJIError) = callback.onRegisterFailure(error)

                override fun onProductDisconnect(productId: Int) = Unit

                override fun onProductConnect(productId: Int) = Unit

                override fun onProductChanged(productId: Int) = Unit

                override fun onInitProcess(event: DJISDKInitEvent, totalProcess: Int) {
                    callback.onInitProcess(event == DJISDKInitEvent.INITIALIZE_COMPLETE, totalProcess)
                }

                override fun onDatabaseDownloadProgress(current: Long, total: Long) = Unit
            })
        }

        override fun destroy() {
            SDKManager.getInstance().destroy()
        }

        override fun registerApp() {
            SDKManager.getInstance().registerApp()
        }

        override fun isRegistered(): Boolean = SDKManager.getInstance().isRegistered

        override fun addNetworkStatusListener(listener: (Boolean) -> Unit) {
            val statusListener = IDJINetworkStatusListener(listener)
            networkListener = statusListener
            DJINetworkManager.getInstance().addNetworkStatusListener(statusListener)
        }

        override fun removeNetworkStatusListener() {
            networkListener?.let { DJINetworkManager.getInstance().removeNetworkStatusListener(it) }
            networkListener = null
        }
    }
}
