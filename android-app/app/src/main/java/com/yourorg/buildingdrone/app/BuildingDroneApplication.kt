package com.yourorg.buildingdrone.app

import android.app.Application

class BuildingDroneApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer()
    }
}
