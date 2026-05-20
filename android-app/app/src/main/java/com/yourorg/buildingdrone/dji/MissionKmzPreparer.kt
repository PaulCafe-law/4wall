package com.yourorg.buildingdrone.dji

import com.yourorg.buildingdrone.data.MissionBundle

enum class KmzGenerationSource(val label: String) {
    SERVER("server"),
    ANDROID_WPMZ("android_wpmz"),
    DJI_FLY_BASELINE("dji_fly_baseline")
}

data class PreparedMissionKmz(
    val source: KmzGenerationSource,
    val localPath: String,
    val displayName: String? = null
)

interface MissionKmzPreparer {
    fun prepare(missionBundle: MissionBundle): PreparedMissionKmz
}

object ServerMissionKmzPreparer : MissionKmzPreparer {
    override fun prepare(missionBundle: MissionBundle): PreparedMissionKmz {
        return PreparedMissionKmz(
            source = KmzGenerationSource.SERVER,
            localPath = missionBundle.artifacts.missionKmz.localPath,
            displayName = missionBundle.artifacts.missionKmz.name
        )
    }
}
