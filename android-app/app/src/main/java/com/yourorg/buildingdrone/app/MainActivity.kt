package com.yourorg.buildingdrone.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.ui.BuildingDroneTheme
import com.yourorg.buildingdrone.ui.ConsoleHomeScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as BuildingDroneApplication).container

        setContent {
            var missionBundle by remember { mutableStateOf<MissionBundle?>(null) }
            val demoCoordinator = remember { DemoMissionCoordinator(container.flightReducer) }

            LaunchedEffect(Unit) {
                missionBundle = container.missionRepository.loadMissionBundle()
            }

            LaunchedEffect(missionBundle) {
                demoCoordinator.attachBundle(missionBundle)
            }

            BuildingDroneTheme {
                ConsoleHomeScreen(demoCoordinator = demoCoordinator)
            }
        }
    }
}
