package com.yourorg.buildingdrone.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import com.yourorg.buildingdrone.ui.BuildingDroneTheme
import com.yourorg.buildingdrone.ui.ConsoleHomeScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as BuildingDroneApplication).container

        setContent {
            val missionBundle by produceState<com.yourorg.buildingdrone.data.MissionBundle?>(initialValue = null) {
                value = container.missionRepository.loadMissionBundle()
            }
            val demoCoordinator = remember { DemoMissionCoordinator(container.flightReducer) }

            LaunchedEffect(missionBundle) {
                demoCoordinator.attachBundle(missionBundle)
            }

            BuildingDroneTheme {
                ConsoleHomeScreen(demoCoordinator = demoCoordinator)
            }
        }
    }
}
