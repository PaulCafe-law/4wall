package com.yourorg.buildingdrone.feature.preflight

import com.yourorg.buildingdrone.ui.ScreenDataState

data class PreflightChecklistItem(
    val label: String,
    val passed: Boolean,
    val detail: String
)

data class IndoorConfirmationItem(
    val id: String,
    val label: String,
    val checked: Boolean
)

data class PreflightActionState(
    val label: String,
    val enabled: Boolean,
    val visible: Boolean = true
)

data class PreflightUiState(
    val status: ScreenDataState = ScreenDataState.EMPTY,
    val blockers: List<String> = emptyList(),
    val readyToUpload: Boolean = false,
    val checklist: List<PreflightChecklistItem> = emptyList(),
    val warning: String? = null,
    val modeLabel: String = "戶外 / 需 GPS",
    val operationSummary: String = "確認所有安全門檻後，才能進入起飛或任務執行。",
    val nextStep: String = "依序完成檢查項目，再核准起飛前檢查。",
    val decisionHint: String = "任何不確定性都先落到 HOLD。",
    val propOnBlocked: Boolean = false,
    val propOnBlockReason: String? = null,
    val uploadActionLabel: String = "上傳任務並起飛",
    val indoorConfirmations: List<IndoorConfirmationItem> = emptyList(),
    val autonomyStatus: String? = null,
    val appTakeoffAction: PreflightActionState = PreflightActionState(
        label = "App 起飛",
        enabled = false,
        visible = false
    ),
    val rcHoverAction: PreflightActionState = PreflightActionState(
        label = "RC 手動起飛已就緒",
        enabled = false,
        visible = false
    ),
    val landAction: PreflightActionState = PreflightActionState(
        label = "降落",
        enabled = false,
        visible = false
    )
)
