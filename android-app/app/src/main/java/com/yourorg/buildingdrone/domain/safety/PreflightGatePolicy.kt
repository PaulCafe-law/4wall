package com.yourorg.buildingdrone.domain.safety

import com.yourorg.buildingdrone.domain.operations.IndoorNoGpsConfirmationState
import com.yourorg.buildingdrone.domain.operations.OperationProfile

enum class PreflightGateId {
    AIRCRAFT_CONNECTED,
    REMOTE_CONTROLLER_CONNECTED,
    CAMERA_STREAM,
    STORAGE,
    DEVICE_HEALTH,
    FLY_ZONE,
    GPS,
    MISSION_BUNDLE,
    INDOOR_PROFILE_CONFIRMATION
}

data class PreflightSnapshot(
    val aircraftConnected: Boolean,
    val remoteControllerConnected: Boolean,
    val cameraStreamAvailable: Boolean,
    val cameraStreamDetail: String? = null,
    val availableStorageBytes: Long,
    val minimumStorageBytes: Long,
    val deviceHealthBlocking: Boolean,
    val deviceHealthMessage: String? = null,
    val flyZoneBlocking: Boolean,
    val flyZoneMessage: String? = null,
    val gpsReady: Boolean,
    val gpsDetail: String? = null,
    val missionBundlePresent: Boolean,
    val missionBundleVerified: Boolean,
    val operationProfile: OperationProfile = OperationProfile.OUTDOOR_GPS_REQUIRED,
    val indoorConfirmationState: IndoorNoGpsConfirmationState = IndoorNoGpsConfirmationState()
)

data class PreflightGateResult(
    val gateId: PreflightGateId,
    val passed: Boolean,
    val blocking: Boolean,
    val detail: String
)

data class PreflightEvaluation(
    val canTakeoff: Boolean,
    val gates: List<PreflightGateResult>,
    val profileBlockingReason: String? = null
) {
    val blockers: List<PreflightGateResult>
        get() = gates.filter { !it.passed && it.blocking }
}

interface PreflightGatePolicy {
    fun evaluate(snapshot: PreflightSnapshot): PreflightEvaluation
}

class DefaultPreflightGatePolicy : PreflightGatePolicy {
    override fun evaluate(snapshot: PreflightSnapshot): PreflightEvaluation {
        val gpsBlocking = snapshot.operationProfile == OperationProfile.OUTDOOR_GPS_REQUIRED
        val indoorProfile = snapshot.operationProfile == OperationProfile.INDOOR_NO_GPS

        val gates = buildList {
            add(
            PreflightGateResult(
                gateId = PreflightGateId.AIRCRAFT_CONNECTED,
                passed = snapshot.aircraftConnected,
                blocking = true,
                detail = if (snapshot.aircraftConnected) "Aircraft connected" else "Aircraft not connected"
            ))
            add(
            PreflightGateResult(
                gateId = PreflightGateId.REMOTE_CONTROLLER_CONNECTED,
                passed = snapshot.remoteControllerConnected,
                blocking = true,
                detail = if (snapshot.remoteControllerConnected) "Remote controller connected" else "Remote controller not connected"
            ))
            add(
            PreflightGateResult(
                gateId = PreflightGateId.CAMERA_STREAM,
                passed = snapshot.cameraStreamAvailable,
                blocking = true,
                detail = snapshot.cameraStreamDetail ?: if (snapshot.cameraStreamAvailable) {
                    "Camera stream available"
                } else {
                    "Camera stream unavailable"
                }
            ))
            add(
            PreflightGateResult(
                gateId = PreflightGateId.STORAGE,
                passed = snapshot.availableStorageBytes >= snapshot.minimumStorageBytes,
                blocking = true,
                detail = if (snapshot.availableStorageBytes >= snapshot.minimumStorageBytes) {
                    "Storage available"
                } else {
                    "Insufficient storage"
                }
            ))
            add(
            PreflightGateResult(
                gateId = PreflightGateId.DEVICE_HEALTH,
                passed = !snapshot.deviceHealthBlocking,
                blocking = true,
                detail = snapshot.deviceHealthMessage ?: if (snapshot.deviceHealthBlocking) "Device health blocking issue" else "Device health normal"
            ))
            add(
            PreflightGateResult(
                gateId = PreflightGateId.FLY_ZONE,
                passed = !snapshot.flyZoneBlocking,
                blocking = true,
                detail = snapshot.flyZoneMessage ?: if (snapshot.flyZoneBlocking) "Fly zone warning blocks takeoff" else "No blocking fly zone warning"
            ))
            add(
            PreflightGateResult(
                gateId = PreflightGateId.GPS,
                passed = snapshot.gpsReady || !gpsBlocking,
                blocking = gpsBlocking,
                detail = when {
                    snapshot.gpsReady -> snapshot.gpsDetail ?: "GPS ready"
                    gpsBlocking -> snapshot.gpsDetail ?: "GPS below threshold"
                    else -> snapshot.gpsDetail ?: "GPS unavailable is expected in indoor no-GPS mode"
                }
            ))
            add(
            PreflightGateResult(
                gateId = PreflightGateId.MISSION_BUNDLE,
                passed = snapshot.missionBundlePresent && snapshot.missionBundleVerified,
                blocking = true,
                detail = when {
                    !snapshot.missionBundlePresent -> "Mission bundle missing"
                    !snapshot.missionBundleVerified -> "Mission bundle verification failed"
                    else -> "Mission bundle verified"
                }
            ))
            if (indoorProfile) {
                add(
                    PreflightGateResult(
                        gateId = PreflightGateId.INDOOR_PROFILE_CONFIRMATION,
                        passed = snapshot.indoorConfirmationState.complete,
                        blocking = true,
                        detail = when {
                            snapshot.indoorConfirmationState.complete -> "Indoor no-GPS confirmations complete"
                            else -> "Confirm indoor site, acknowledge RTH unavailable, confirm observer, clear takeoff zone, and manual takeover readiness"
                        }
                    )
                )
            }
        }

        return PreflightEvaluation(
            canTakeoff = gates.none { !it.passed && it.blocking },
            gates = gates,
            profileBlockingReason = if (indoorProfile && !snapshot.indoorConfirmationState.complete) {
                "Indoor no-GPS mode requires explicit operator confirmations before takeoff."
            } else {
                null
            }
        )
    }
}
