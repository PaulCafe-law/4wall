package com.yourorg.buildingdrone.dji.real

import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.dji.KmzGenerationSource
import com.yourorg.buildingdrone.dji.MissionKmzPreparer
import com.yourorg.buildingdrone.dji.PreparedMissionKmz
import java.io.File

class BaselineFirstMissionKmzPreparer(
    private val baselineKmzFile: File,
    private val fallback: MissionKmzPreparer,
) : MissionKmzPreparer {
    override fun prepare(missionBundle: MissionBundle): PreparedMissionKmz {
        if (baselineKmzFile.exists() && baselineKmzFile.length() > 0L) {
            return PreparedMissionKmz(
                source = KmzGenerationSource.DJI_FLY_BASELINE,
                localPath = baselineKmzFile.absolutePath,
                displayName = baselineKmzFile.name
            )
        }
        return fallback.prepare(missionBundle)
    }
}
