package com.yourorg.buildingdrone.app

import android.app.Application
import android.content.Context
import androidx.lifecycle.ProcessLifecycleOwner

class BuildingDroneApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun attachBaseContext(base: Context?) {
        super.attachBaseContext(base)
        installModeRuntime(this)
    }

    override fun onCreate() {
        super.onCreate()
        container = createAppContainer(this)
        ProcessLifecycleOwner.get().lifecycle.addObserver(container.mobileSdkSession)
        container.mobileSdkSession.initialize(this)
    }

    override fun onTerminate() {
        container.mobileSdkSession.destroy()
        super.onTerminate()
    }
}
