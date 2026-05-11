package com.yourorg.buildingdrone.domain.operations

enum class OperationProfile(
    val wireName: String,
    val displayLabel: String,
) {
    OUTDOOR_GPS_REQUIRED(
        wireName = "outdoor_gps_patrol",
        displayLabel = "戶外 / 需 GPS",
    ),
    INDOOR_NO_GPS(
        wireName = "indoor_no_gps",
        displayLabel = "室內 / 無 GPS",
    );

    companion object {
        fun fromWireName(value: String?): OperationProfile {
            return entries.firstOrNull { it.wireName == value } ?: OUTDOOR_GPS_REQUIRED
        }
    }
}

enum class ExecutionMode(
    val wireName: String,
    val displayLabel: String,
) {
    PATROL_ROUTE(
        wireName = "patrol_route",
        displayLabel = "巡邏航線",
    ),
    MANUAL_PILOT(
        wireName = "manual_pilot",
        displayLabel = "手動飛行",
    ),
}

enum class MissionContextMode {
    PLANNED_BUNDLE,
    UNPLANNED_MANUAL,
}

data class ConsoleExecutionPolicy(
    val requiresMissionBundle: Boolean,
    val requiresGpsGate: Boolean,
    val requiresSimulatorGate: Boolean,
    val allowsMissionUpload: Boolean,
)

enum class OperatorConsoleMode(
    val modeId: String,
    val displayLabel: String,
    val detail: String,
    val executedOperatingProfile: OperationProfile,
    val executionMode: ExecutionMode,
    val patrolRouteEnabled: Boolean,
    val manualPilotEnabled: Boolean,
    val executionPolicy: ConsoleExecutionPolicy,
) {
    INDOOR_MANUAL(
        modeId = "indoor_manual",
        displayLabel = "室內手動",
        detail = "室內 / 無 GPS 手動飛行。可直接進入 Manual Pilot，不走 waypoint mission。",
        executedOperatingProfile = OperationProfile.INDOOR_NO_GPS,
        executionMode = ExecutionMode.MANUAL_PILOT,
        patrolRouteEnabled = false,
        manualPilotEnabled = true,
        executionPolicy = ConsoleExecutionPolicy(
            requiresMissionBundle = false,
            requiresGpsGate = false,
            requiresSimulatorGate = false,
            allowsMissionUpload = false,
        ),
    ),
    OUTDOOR_PATROL(
        modeId = "outdoor_patrol",
        displayLabel = "戶外巡邏",
        detail = "戶外 GPS 巡邏。需已驗證 mission bundle，並經過 simulator / preflight gate。",
        executedOperatingProfile = OperationProfile.OUTDOOR_GPS_REQUIRED,
        executionMode = ExecutionMode.PATROL_ROUTE,
        patrolRouteEnabled = true,
        manualPilotEnabled = false,
        executionPolicy = ConsoleExecutionPolicy(
            requiresMissionBundle = true,
            requiresGpsGate = true,
            requiresSimulatorGate = true,
            allowsMissionUpload = true,
        ),
    ),
    OUTDOOR_MANUAL_PILOT(
        modeId = "outdoor_manual_pilot",
        displayLabel = "戶外手動",
        detail = "戶外手動飛行。可直接進入 Manual Pilot；GPS 只做診斷，不走 waypoint mission。",
        executedOperatingProfile = OperationProfile.OUTDOOR_GPS_REQUIRED,
        executionMode = ExecutionMode.MANUAL_PILOT,
        patrolRouteEnabled = false,
        manualPilotEnabled = true,
        executionPolicy = ConsoleExecutionPolicy(
            requiresMissionBundle = false,
            requiresGpsGate = false,
            requiresSimulatorGate = false,
            allowsMissionUpload = false,
        ),
    );

    val supportsRth: Boolean
        get() = executedOperatingProfile == OperationProfile.OUTDOOR_GPS_REQUIRED

    val requiresMissionBundle: Boolean
        get() = executionPolicy.requiresMissionBundle

    val requiresGpsGate: Boolean
        get() = executionPolicy.requiresGpsGate

    val requiresSimulatorGate: Boolean
        get() = executionPolicy.requiresSimulatorGate

    val allowsMissionUpload: Boolean
        get() = executionPolicy.allowsMissionUpload

    fun resolveMissionContextMode(bundleVerified: Boolean): MissionContextMode {
        return when {
            executionMode == ExecutionMode.MANUAL_PILOT && !bundleVerified -> MissionContextMode.UNPLANNED_MANUAL
            else -> MissionContextMode.PLANNED_BUNDLE
        }
    }

    companion object {
        fun defaultForProfile(profile: OperationProfile): OperatorConsoleMode {
            return when (profile) {
                OperationProfile.OUTDOOR_GPS_REQUIRED -> OUTDOOR_PATROL
                OperationProfile.INDOOR_NO_GPS -> INDOOR_MANUAL
            }
        }
    }
}

enum class AutonomyCapability {
    UNKNOWN,
    SUPPORTED,
    UNSUPPORTED,
}

data class OperationCapabilities(
    val gpsRequired: Boolean,
    val autonomyAllowed: Boolean,
    val rthAvailable: Boolean,
    val appTakeoffAllowed: Boolean,
    val rcTakeoffAllowed: Boolean,
)

data class IndoorNoGpsConfirmationState(
    val siteConfirmed: Boolean = false,
    val rthUnavailableAcknowledged: Boolean = false,
    val observerReady: Boolean = false,
    val takeoffZoneClear: Boolean = false,
    val manualTakeoverReady: Boolean = false,
) {
    val complete: Boolean
        get() = siteConfirmed &&
            rthUnavailableAcknowledged &&
            observerReady &&
            takeoffZoneClear &&
            manualTakeoverReady
}

fun OperationProfile.defaultCapabilities(
    autonomyCapability: AutonomyCapability = AutonomyCapability.SUPPORTED,
): OperationCapabilities {
    return when (this) {
        OperationProfile.OUTDOOR_GPS_REQUIRED -> OperationCapabilities(
            gpsRequired = true,
            autonomyAllowed = true,
            rthAvailable = true,
            appTakeoffAllowed = true,
            rcTakeoffAllowed = true,
        )

        OperationProfile.INDOOR_NO_GPS -> OperationCapabilities(
            gpsRequired = false,
            autonomyAllowed = autonomyCapability != AutonomyCapability.UNSUPPORTED,
            rthAvailable = false,
            appTakeoffAllowed = true,
            rcTakeoffAllowed = true,
        )
    }
}
