package com.yourorg.buildingdrone.feature.mission

import com.yourorg.buildingdrone.domain.operations.AutonomyCapability
import com.yourorg.buildingdrone.domain.operations.ExecutionMode
import com.yourorg.buildingdrone.domain.operations.OperationProfile
import com.yourorg.buildingdrone.domain.operations.OperatorConsoleMode
import com.yourorg.buildingdrone.ui.ScreenDataState

data class MissionSetupUiState(
    val bundleLoaded: Boolean,
    val demoMode: Boolean,
    val plannedOperatingProfile: OperationProfile? = null,
    val selectedConsoleMode: OperatorConsoleMode = OperatorConsoleMode.OUTDOOR_PATROL,
    val selectionLocked: Boolean = false,
    val status: ScreenDataState = if (bundleLoaded) ScreenDataState.SUCCESS else ScreenDataState.EMPTY,
    val missionLabel: String = if (bundleLoaded) "任務包已載入" else "尚未載入任務包",
    val summary: List<String> = emptyList(),
    val artifactStatus: String = if (bundleLoaded) {
        "mission.kmz 與 mission_meta.json 已就緒"
    } else {
        "尚未取得可飛任務包"
    },
    val warning: String? = null,
    val loadActionLabel: String = if (demoMode) "載入 Demo 任務包" else "登入後同步任務",
    val authStatus: String? = null,
    val profileSummary: String = "請先確認本次任務要用哪一套執行控台。進入下一步後，模式會鎖定直到回到 Mission Setup。",
    val autonomyStatus: String = "室內模式主打手動飛行；戶外模式可選自動巡邏或手動飛行。",
    val nextStep: String = when {
        !bundleLoaded -> "先下載並驗證任務包。"
        else -> "確認 planned profile 與實際執行模式後，再進入連線與起飛前檢查。"
    },
    val continueLabel: String = "前往任務控台",
    val profileMismatchWarning: String? = null,
) {
    val selectedOperatingProfile: OperationProfile
        get() = selectedConsoleMode.executedOperatingProfile

    val selectedExecutionMode: ExecutionMode
        get() = selectedConsoleMode.executionMode
}

fun MissionSetupUiState.withAutonomyCapability(
    capability: AutonomyCapability,
): MissionSetupUiState {
    val message = when (capability) {
        AutonomyCapability.SUPPORTED ->
            "Android 已確認目前路徑支援保守自治。室內維持 Manual Pilot，戶外 Patrol 才會啟動航點任務。"

        AutonomyCapability.UNSUPPORTED ->
            "目前 aircraft path 不支援自治飛行。請改用 Manual Pilot，並以 HOLD 優先。"

        AutonomyCapability.UNKNOWN ->
            "自治能力尚未確認。先完成連線與 preflight，再決定是否進入 Patrol Route。"
    }
    return copy(autonomyStatus = message)
}
