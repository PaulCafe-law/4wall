package com.yourorg.buildingdrone.feature.mission

import com.yourorg.buildingdrone.domain.operations.AutonomyCapability
import com.yourorg.buildingdrone.domain.operations.ExecutionMode
import com.yourorg.buildingdrone.domain.operations.MissionContextMode
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
        "mission.kmz 與 mission_meta.json 已驗證。"
    } else {
        "目前尚未取得任務包。"
    },
    val warning: String? = null,
    val loadActionLabel: String = if (demoMode) "載入 Demo 任務包" else "登入後同步任務",
    val authStatus: String? = null,
    val profileSummary: String = "在 Mission Setup 選擇這次飛行要走的 operator console。離開此頁後，執行模式會鎖定。",
    val autonomyStatus: String = "室內走手動飛行；戶外可選 Patrol Route 或 Manual Pilot。",
    val nextStep: String = when {
        !bundleLoaded -> "先下載並驗證任務包。"
        else -> "確認 console 模式後，前往下一步。"
    },
    val continueLabel: String = "前往連線檢查",
    val canContinue: Boolean = bundleLoaded,
    val missionContextMode: MissionContextMode = MissionContextMode.PLANNED_BUNDLE,
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
            "Android 已確認目前 aircraft path 可接受這次模式；若切到 Manual Pilot，仍以手動控制為主。"

        AutonomyCapability.UNSUPPORTED ->
            "目前 aircraft path 不接受室內自治，請改用 Manual Pilot，並保持 HOLD 優先。"

        AutonomyCapability.UNKNOWN ->
            "尚未完成能力確認。請先完成連線檢查與 preflight，再決定是否進入 Patrol Route。"
    }
    return copy(autonomyStatus = message)
}
