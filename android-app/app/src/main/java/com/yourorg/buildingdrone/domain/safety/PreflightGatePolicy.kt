package com.yourorg.buildingdrone.domain.safety

enum class PreflightGateId {
    AIRCRAFT_CONNECTED,
    REMOTE_CONTROLLER_CONNECTED,
    CAMERA_STREAM,
    STORAGE,
    DEVICE_HEALTH,
    FLY_ZONE,
    GPS,
    MISSION_BUNDLE
}

data class PreflightSnapshot(
    val aircraftConnected: Boolean,
    val remoteControllerConnected: Boolean,
    val cameraStreamAvailable: Boolean,
    val availableStorageBytes: Long,
    val minimumStorageBytes: Long,
    val deviceHealthBlocking: Boolean,
    val deviceHealthMessage: String? = null,
    val flyZoneBlocking: Boolean,
    val flyZoneMessage: String? = null,
    val gpsReady: Boolean,
    val gpsDetail: String? = null,
    val missionBundlePresent: Boolean,
    val missionBundleVerified: Boolean
)

data class PreflightGateResult(
    val gateId: PreflightGateId,
    val passed: Boolean,
    val blocking: Boolean,
    val detail: String
)

data class PreflightEvaluation(
    val canTakeoff: Boolean,
    val gates: List<PreflightGateResult>
) {
    val blockers: List<PreflightGateResult>
        get() = gates.filter { !it.passed && it.blocking }
}

interface PreflightGatePolicy {
    fun evaluate(snapshot: PreflightSnapshot): PreflightEvaluation
}

class DefaultPreflightGatePolicy : PreflightGatePolicy {
    override fun evaluate(snapshot: PreflightSnapshot): PreflightEvaluation {
        val gates = listOf(
            PreflightGateResult(
                gateId = PreflightGateId.AIRCRAFT_CONNECTED,
                passed = snapshot.aircraftConnected,
                blocking = true,
                detail = if (snapshot.aircraftConnected) "Aircraft connected" else "Aircraft not connected"
            ),
            PreflightGateResult(
                gateId = PreflightGateId.REMOTE_CONTROLLER_CONNECTED,
                passed = snapshot.remoteControllerConnected,
                blocking = true,
                detail = if (snapshot.remoteControllerConnected) "Remote controller connected" else "Remote controller not connected"
            ),
            PreflightGateResult(
                gateId = PreflightGateId.CAMERA_STREAM,
                passed = snapshot.cameraStreamAvailable,
                blocking = true,
                detail = if (snapshot.cameraStreamAvailable) "Camera stream available" else "Camera stream unavailable"
            ),
            PreflightGateResult(
                gateId = PreflightGateId.STORAGE,
                passed = snapshot.availableStorageBytes >= snapshot.minimumStorageBytes,
                blocking = true,
                detail = if (snapshot.availableStorageBytes >= snapshot.minimumStorageBytes) {
                    "Storage available"
                } else {
                    "Insufficient storage"
                }
            ),
            PreflightGateResult(
                gateId = PreflightGateId.DEVICE_HEALTH,
                passed = !snapshot.deviceHealthBlocking,
                blocking = true,
                detail = snapshot.deviceHealthMessage ?: if (snapshot.deviceHealthBlocking) "Device health blocking issue" else "Device health normal"
            ),
            PreflightGateResult(
                gateId = PreflightGateId.FLY_ZONE,
                passed = !snapshot.flyZoneBlocking,
                blocking = true,
                detail = snapshot.flyZoneMessage ?: if (snapshot.flyZoneBlocking) "Fly zone warning blocks takeoff" else "No blocking fly zone warning"
            ),
            PreflightGateResult(
                gateId = PreflightGateId.GPS,
                passed = snapshot.gpsReady,
                blocking = true,
                detail = snapshot.gpsDetail ?: if (snapshot.gpsReady) "GPS ready" else "GPS below threshold"
            ),
            PreflightGateResult(
                gateId = PreflightGateId.MISSION_BUNDLE,
                passed = snapshot.missionBundlePresent && snapshot.missionBundleVerified,
                blocking = true,
                detail = when {
                    !snapshot.missionBundlePresent -> "Mission bundle missing"
                    !snapshot.missionBundleVerified -> "Mission bundle verification failed"
                    else -> "Mission bundle verified"
                }
            )
        )

        return PreflightEvaluation(
            canTakeoff = gates.none { !it.passed && it.blocking },
            gates = gates
        )
    }
}
