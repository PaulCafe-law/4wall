package com.yourorg.buildingdrone.dji

import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.data.seedMissionBundle
import com.yourorg.buildingdrone.dji.real.BaselineFirstMissionKmzPreparer
import com.yourorg.buildingdrone.dji.real.DjiFlyShapeMissionKmzPreparer
import java.util.zip.ZipFile
import kotlin.io.path.createTempDirectory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProdMissionKmzPreparerTest {
    @Test
    fun djiFlyShapeMissionKmzPreparer_generatesMini4ProFlyShapedKmz() {
        val seedRoot = createTempDirectory(prefix = "dji-fly-shape-kmz").toFile()
        val bundle = seedMissionBundle(seedRoot)
        val preparer = DjiFlyShapeMissionKmzPreparer(
            outputDirectory = seedRoot.resolve("generated"),
            clockMillis = { 1776094516960L }
        )

        val prepared = preparer.prepare(bundle)

        assertEquals(KmzGenerationSource.ANDROID_DJI_FLY_SHAPE, prepared.source)
        ZipFile(prepared.localPath).use { archive ->
            val names = archive.entries().asSequence().map { it.name }.toSet()
            assertTrue("wpmz/template.kml" in names)
            assertTrue("wpmz/waylines.wpml" in names)
            val template = archive.readText("wpmz/template.kml")
            val waylines = archive.readText("wpmz/waylines.wpml")
            assertTrue(template.contains("http://www.uav.com/wpmz/1.0.2"))
            assertFalse(template.contains("<Placemark>"))
            assertFalse(waylines.contains("efficiencyFlightModeEnable"))
            assertTrue(waylines.contains("<wpml:droneEnumValue>68</wpml:droneEnumValue>"))
            assertTrue(waylines.contains("<wpml:waylineId>0</wpml:waylineId>"))
            assertTrue(waylines.contains("<wpml:executeHeight>50</wpml:executeHeight>"))
            assertTrue(waylines.contains("<wpml:autoFlightSpeed>2.5</wpml:autoFlightSpeed>"))
            assertEquals(2, Regex("<Placemark>").findAll(waylines).count())
            assertTrue(waylines.contains("gimbalRotate"))
            assertTrue(waylines.contains("gimbalEvenlyRotate"))
        }

        seedRoot.deleteRecursively()
    }

    @Test
    fun baselineFirstMissionKmzPreparer_prefersDjiFlyGoldenKmzWhenPresent() {
        val seedRoot = createTempDirectory(prefix = "dji-fly-baseline-kmz").toFile()
        val bundle = seedMissionBundle(seedRoot)
        val baseline = seedRoot.resolve("dji-fly-baseline.kmz")
        java.io.File(bundle.artifacts.missionKmz.localPath).copyTo(baseline, overwrite = true)
        var fallbackCalled = false
        val preparer = BaselineFirstMissionKmzPreparer(
            baselineKmzFile = baseline,
            fallback = object : MissionKmzPreparer {
                override fun prepare(missionBundle: MissionBundle): PreparedMissionKmz {
                    fallbackCalled = true
                    return PreparedMissionKmz(
                        source = KmzGenerationSource.ANDROID_DJI_FLY_SHAPE,
                        localPath = missionBundle.artifacts.missionKmz.localPath,
                        displayName = "fallback.kmz"
                    )
                }
            }
        )

        val prepared = preparer.prepare(bundle)

        assertEquals(KmzGenerationSource.DJI_FLY_BASELINE, prepared.source)
        assertEquals(baseline.absolutePath, prepared.localPath)
        assertEquals("dji-fly-baseline.kmz", prepared.displayName)
        assertFalse(fallbackCalled)

        seedRoot.deleteRecursively()
    }
}

private fun ZipFile.readText(entryName: String): String {
    return getInputStream(getEntry(entryName)).use { stream ->
        stream.readBytes().toString(Charsets.UTF_8)
    }
}
