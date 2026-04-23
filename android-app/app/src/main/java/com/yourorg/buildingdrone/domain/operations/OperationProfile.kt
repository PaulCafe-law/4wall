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
        displayLabel = "自動巡邏",
    ),
    MANUAL_PILOT(
        wireName = "manual_pilot",
        displayLabel = "手動飛行",
    );
}

enum class OperatorConsoleMode(
    val modeId: String,
    val displayLabel: String,
    val detail: String,
    val executedOperatingProfile: OperationProfile,
    val executionMode: ExecutionMode,
    val patrolRouteEnabled: Boolean,
    val manualPilotEnabled: Boolean,
) {
    INDOOR_MANUAL(
        modeId = "indoor_manual",
        displayLabel = "Indoor Manual",
        detail = "室內模式只保留手動飛行、降落與接管，不啟用航點巡邏。",
        executedOperatingProfile = OperationProfile.INDOOR_NO_GPS,
        executionMode = ExecutionMode.MANUAL_PILOT,
        patrolRouteEnabled = false,
        manualPilotEnabled = true,
    ),
    OUTDOOR_PATROL(
        modeId = "outdoor_patrol",
        displayLabel = "Outdoor Patrol",
        detail = "戶外模式使用已規劃航線執行自動巡邏，保留返航與降落流程。",
        executedOperatingProfile = OperationProfile.OUTDOOR_GPS_REQUIRED,
        executionMode = ExecutionMode.PATROL_ROUTE,
        patrolRouteEnabled = true,
        manualPilotEnabled = false,
    ),
    OUTDOOR_MANUAL_PILOT(
        modeId = "outdoor_manual_pilot",
        displayLabel = "Outdoor Manual Pilot",
        detail = "戶外模式直接進入相機預覽與雙搖桿手動飛行，不啟動航點任務。",
        executedOperatingProfile = OperationProfile.OUTDOOR_GPS_REQUIRED,
        executionMode = ExecutionMode.MANUAL_PILOT,
        patrolRouteEnabled = false,
        manualPilotEnabled = true,
    );

    val supportsRth: Boolean
        get() = executedOperatingProfile == OperationProfile.OUTDOOR_GPS_REQUIRED

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
