package com.yourorg.buildingdrone.dji.real

import android.app.Application
import android.content.pm.PackageManager
import android.os.Build
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
    private val gateway: Gateway = RealGateway(),
    private val manifestApiKeyProvider: (Application) -> String? = ::readManifestApiKey
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
    private var applicationRef: Application? = null

    override val state: StateFlow<SdkSessionState> = mutableState.asStateFlow()

    override fun initialize(application: Application) {
        if (initialized) {
            return
        }
        applicationRef = application
        val manifestApiKey = manifestApiKeyProvider(application)
        if (manifestApiKey.isNullOrBlank() || manifestApiKey == "MISSING_DJI_API_KEY") {
            mutableState.value = mutableState.value.copy(
                initialized = false,
                registered = false,
                lastError = "DJI App Key is missing from the manifest. Rebuild the prod app with -PDJI_API_KEY or set DJI_API_KEY in the environment."
            )
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

    override fun retryRegistration() {
        val application = applicationRef ?: return
        val manifestApiKey = manifestApiKeyProvider(application)
        if (manifestApiKey.isNullOrBlank() || manifestApiKey == "MISSING_DJI_API_KEY") {
            mutableState.value = mutableState.value.copy(
                registered = false,
                lastError = "DJI App Key is missing from the manifest. Rebuild the prod app with -PDJI_API_KEY or set DJI_API_KEY in the environment."
            )
            return
        }
        if (!mutableState.value.initialized || gateway.isRegistered()) {
            return
        }
        runCatching {
            gateway.registerApp()
        }.onFailure { error ->
            mutableState.value = mutableState.value.copy(
                registered = false,
                lastError = error.message ?: error.javaClass.simpleName
            )
        }
    }

    override fun destroy() {
        gateway.removeNetworkStatusListener()
        gateway.destroy()
    }

    companion object {
        private const val DJI_API_KEY_METADATA = "com.dji.sdk.API_KEY"

        private fun readManifestApiKey(application: Application): String? {
            return runCatching {
                val packageManager = application.packageManager
                val applicationInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    packageManager.getApplicationInfo(
                        application.packageName,
                        PackageManager.ApplicationInfoFlags.of(PackageManager.GET_META_DATA.toLong())
                    )
                } else {
                    @Suppress("DEPRECATION")
                    packageManager.getApplicationInfo(application.packageName, PackageManager.GET_META_DATA)
                }
                applicationInfo.metaData?.getString(DJI_API_KEY_METADATA)
            }.getOrNull()
        }
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
