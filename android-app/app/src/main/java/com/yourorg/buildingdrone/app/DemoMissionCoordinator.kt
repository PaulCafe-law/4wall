package com.yourorg.buildingdrone.app

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.yourorg.buildingdrone.data.MissionBundle
import com.yourorg.buildingdrone.domain.statemachine.FlightEventType
import com.yourorg.buildingdrone.domain.statemachine.FlightReducer
import com.yourorg.buildingdrone.domain.statemachine.FlightStage
import com.yourorg.buildingdrone.domain.statemachine.FlightState
import com.yourorg.buildingdrone.domain.statemachine.TransitionContext
import com.yourorg.buildingdrone.feature.branchverify.BranchVerifyUiState
import com.yourorg.buildingdrone.feature.emergency.EmergencyMode
import com.yourorg.buildingdrone.feature.emergency.EmergencyUiState
import com.yourorg.buildingdrone.feature.inspection.InspectionCaptureUiState
import com.yourorg.buildingdrone.feature.mission.MissionSetupUiState
import com.yourorg.buildingdrone.feature.preflight.PreflightChecklistItem
import com.yourorg.buildingdrone.feature.preflight.PreflightUiState
import com.yourorg.buildingdrone.feature.transit.TelemetryField
import com.yourorg.buildingdrone.feature.transit.TransitUiState
import com.yourorg.buildingdrone.ui.ScreenDataState

enum class ConsoleScreen(val label: String) {
    MISSION_SETUP("Mission Setup"),
    PREFLIGHT("Preflight"),
    IN_FLIGHT("In-Flight"),
    BRANCH_CONFIRM("Branch Confirm"),
    INSPECTION("Inspection"),
    EMERGENCY("Emergency")
}

class DemoMissionCoordinator(
    private val reducer: FlightReducer
) {
    var missionBundle by mutableStateOf<MissionBundle?>(null)
        private set
    var flightState by mutableStateOf(FlightState())
        private set
    var activeScreen by mutableStateOf(ConsoleScreen.MISSION_SETUP)
        private set

    var missionSetup by mutableStateOf(
        MissionSetupUiState(
            bundleLoaded = false,
            demoMode = true,
            status = ScreenDataState.EMPTY,
            missionLabel = "No mission loaded",
            artifactStatus = "mock bundle not attached"
        )
    )
        private set

    var preflight by mutableStateOf(
        PreflightUiState(
            blockers = listOf("Mission not loaded"),
            readyToUpload = false,
            checklist = listOf(
                PreflightChecklistItem("Aircraft link", false, "waiting for demo load"),
                PreflightChecklistItem("Mission bundle", false, "not loaded"),
                PreflightChecklistItem("Safety policy", true, "conservative defaults armed")
            ),
            warning = "Demo mode only"
        )
    )
        private set

    var transit by mutableStateOf(
        TransitUiState(
            stateLabel = "IDLE",
            emergencyVisible = true,
            status = ScreenDataState.EMPTY,
            telemetry = defaultTelemetry("Awaiting mission")
        )
    )
        private set

    var branchVerify by mutableStateOf(
        BranchVerifyUiState(
            availableOptions = listOf("LEFT", "RIGHT", "STRAIGHT"),
            status = ScreenDataState.EMPTY
        )
    )
        private set

    var inspection by mutableStateOf(
        InspectionCaptureUiState(
            viewpointLabel = "north-east-facade",
            captureStatus = ScreenDataState.EMPTY
        )
    )
        private set

    var emergency by mutableStateOf(
        EmergencyUiState(
            reason = "No active fail-safe",
            mode = EmergencyMode.INFO,
            nextStep = "Load a mission and start demo flow"
        )
    )
        private set

    fun attachBundle(bundle: MissionBundle?) {
        missionBundle = bundle
        missionSetup = missionSetup.copy(
            bundleLoaded = bundle != null,
            status = if (bundle == null) ScreenDataState.EMPTY else ScreenDataState.PARTIAL,
            missionLabel = bundle?.missionId ?: "No mission loaded",
            artifactStatus = if (bundle == null) {
                "mock bundle not attached"
            } else {
                "mission meta + local demo bundle attached"
            },
            summary = bundle?.let {
                listOf(
                    "${it.corridorSegments.size} corridor segment(s)",
                    "${it.verificationPoints.size} verification point(s)",
                    "${it.inspectionViewpoints.size} inspection viewpoint(s)",
                    "Failsafe: ${it.failsafe.onSemanticTimeout}/${it.failsafe.onBatteryCritical}"
                )
            } ?: emptyList()
        )
    }

    fun selectScreen(screen: ConsoleScreen) {
        activeScreen = screen
    }

    fun openPreflightChecklist() {
        if (missionBundle == null) {
            missionSetup = missionSetup.copy(
                status = ScreenDataState.ERROR,
                warning = "Load mission bundle before opening preflight"
            )
            return
        }
        activeScreen = ConsoleScreen.PREFLIGHT
    }

    fun loadMockMission() {
        if (missionBundle == null) {
            missionSetup = missionSetup.copy(
                status = ScreenDataState.ERROR,
                warning = "Mock bundle missing from local app container"
            )
            return
        }
        applyEvent(FlightEventType.MISSION_SELECTED)
        applyEvent(FlightEventType.MISSION_BUNDLE_DOWNLOADED, TransitionContext(missionBundleLoaded = true))
        missionSetup = missionSetup.copy(
            bundleLoaded = true,
            status = ScreenDataState.SUCCESS,
            warning = "Demo bundle loaded locally. Server is out of the control loop."
        )
        preflight = preflight.copy(
            blockers = listOf("Upload mission before takeoff"),
            readyToUpload = false,
            checklist = listOf(
                PreflightChecklistItem("Aircraft link", true, "demo aircraft attached"),
                PreflightChecklistItem("Mission bundle", true, "mock mission loaded"),
                PreflightChecklistItem("Safety policy", true, "hold / rth defaults active")
            ),
            warning = "Flight-critical loop remains on device"
        )
        activeScreen = ConsoleScreen.PREFLIGHT
    }

    fun approvePreflight() {
        if (!isInStage(FlightStage.PRECHECK)) {
            preflight = preflight.copy(
                blockers = listOf("Load mission in Mission Setup first"),
                readyToUpload = false,
                warning = "Preflight cannot be approved before mission load."
            )
            activeScreen = ConsoleScreen.PREFLIGHT
            return
        }
        applyEvent(FlightEventType.PREFLIGHT_OK, TransitionContext(missionBundleLoaded = true))
        preflight = preflight.copy(
            blockers = emptyList(),
            readyToUpload = true,
            warning = "Ready to upload waypoint mission"
        )
    }

    fun uploadAndStartMission() {
        if (!isInStage(FlightStage.MISSION_READY) || !preflight.readyToUpload) {
            preflight = preflight.copy(
                blockers = listOf("Approve preflight before upload"),
                readyToUpload = false,
                warning = "Upload is blocked until the checklist is approved."
            )
            activeScreen = ConsoleScreen.PREFLIGHT
            return
        }
        applyEvent(
            FlightEventType.MISSION_UPLOADED,
            TransitionContext(
                missionBundleLoaded = true,
                missionUploaded = true,
                takeoffComplete = true
            )
        )
        activeScreen = ConsoleScreen.IN_FLIGHT
    }

    fun replayTelemetry() {
        transit = transit.copy(
            status = ScreenDataState.PARTIAL,
            progressLabel = "Demo replay active",
            telemetry = listOf(
                TelemetryField("Lat/Lng", "25.03410, 121.56470"),
                TelemetryField("Altitude", "34.6 m"),
                TelemetryField("Speed", "3.8 m/s"),
                TelemetryField("Battery", "78%"),
                TelemetryField("Deviation", "1.2 m")
            ),
            partialWarning = "Replay uses synthetic telemetry, not live aircraft state",
            nextStep = "Trigger branch confirm or inspection approach"
        )
        activeScreen = ConsoleScreen.IN_FLIGHT
    }

    fun triggerBranchConfirm() {
        if (!isInStage(FlightStage.TRANSIT, FlightStage.LOCAL_AVOID)) {
            transit = transit.copy(
                status = ScreenDataState.ERROR,
                partialWarning = "Branch confirm is only available during in-flight transit."
            )
            activeScreen = ConsoleScreen.IN_FLIGHT
            return
        }
        applyEvent(FlightEventType.VERIFICATION_POINT_REACHED, TransitionContext(missionUploaded = true))
        branchVerify = branchVerify.copy(
            status = ScreenDataState.PARTIAL,
            confidenceLabel = "Confidence 0.74",
            countdownSeconds = 3,
            reason = "Road split ahead. Confirm allowed branch."
        )
        activeScreen = ConsoleScreen.BRANCH_CONFIRM
    }

    fun confirmBranch(option: String) {
        if (!isInStage(FlightStage.BRANCH_VERIFY)) {
            branchVerify = branchVerify.copy(
                status = ScreenDataState.ERROR,
                reason = "Branch confirm is only valid while branch verification is active."
            )
            activeScreen = ConsoleScreen.BRANCH_CONFIRM
            return
        }
        val event = when (option) {
            "LEFT" -> FlightEventType.BRANCH_VERIFY_LEFT
            "RIGHT" -> FlightEventType.BRANCH_VERIFY_RIGHT
            else -> FlightEventType.BRANCH_VERIFY_STRAIGHT
        }
        applyEvent(event, TransitionContext(missionUploaded = true))
        branchVerify = branchVerify.copy(
            status = ScreenDataState.SUCCESS,
            confidenceLabel = "Confirmed $option",
            countdownSeconds = 0,
            reason = "Mission resumed on confirmed branch"
        )
        activeScreen = ConsoleScreen.IN_FLIGHT
    }

    fun branchTimeout() {
        if (!isInStage(FlightStage.BRANCH_VERIFY)) {
            branchVerify = branchVerify.copy(
                status = ScreenDataState.ERROR,
                reason = "Timeout is only valid during branch verification."
            )
            activeScreen = ConsoleScreen.BRANCH_CONFIRM
            return
        }
        applyEvent(FlightEventType.BRANCH_VERIFY_TIMEOUT, TransitionContext(missionUploaded = true))
        branchVerify = branchVerify.copy(
            status = ScreenDataState.ERROR,
            confidenceLabel = "Timed out",
            countdownSeconds = 0,
            reason = "Semantic timeout. Aircraft holding."
        )
        activeScreen = ConsoleScreen.EMERGENCY
    }

    fun triggerObstacleWarn() {
        if (!isInStage(FlightStage.TRANSIT, FlightStage.LOCAL_AVOID)) {
            transit = transit.copy(
                status = ScreenDataState.ERROR,
                partialWarning = "Obstacle warn is only valid during corridor transit."
            )
            activeScreen = ConsoleScreen.IN_FLIGHT
            return
        }
        applyEvent(FlightEventType.OBSTACLE_WARN, TransitionContext(missionUploaded = true))
        transit = transit.copy(
            status = ScreenDataState.PARTIAL,
            riskReason = "Obstacle nearby. Local avoider may only slow or nudge.",
            nextStep = "Clear obstacle or escalate to hold",
            partialWarning = "Bounded autonomy active"
        )
    }

    fun triggerObstacleHardStop() {
        if (!isInStage(FlightStage.TRANSIT, FlightStage.LOCAL_AVOID, FlightStage.BRANCH_VERIFY)) {
            transit = transit.copy(
                status = ScreenDataState.ERROR,
                partialWarning = "Hard stop is only valid during active in-flight operations."
            )
            activeScreen = ConsoleScreen.IN_FLIGHT
            return
        }
        applyEvent(FlightEventType.OBSTACLE_HARD_STOP, TransitionContext(missionUploaded = true))
        activeScreen = ConsoleScreen.EMERGENCY
    }

    fun clearObstacle() {
        if (!isInStage(FlightStage.LOCAL_AVOID)) {
            transit = transit.copy(
                status = ScreenDataState.ERROR,
                partialWarning = "No obstacle clear action is pending."
            )
            activeScreen = ConsoleScreen.IN_FLIGHT
            return
        }
        applyEvent(FlightEventType.OBSTACLE_WARN, TransitionContext(missionUploaded = true, obstacleCleared = true))
        transit = transit.copy(
            status = ScreenDataState.SUCCESS,
            riskReason = null,
            partialWarning = null,
            nextStep = "Continue mission"
        )
        activeScreen = ConsoleScreen.IN_FLIGHT
    }

    fun triggerInspectionApproach() {
        if (!isInStage(FlightStage.TRANSIT, FlightStage.LOCAL_AVOID)) {
            transit = transit.copy(
                status = ScreenDataState.ERROR,
                partialWarning = "Inspection approach starts only from transit."
            )
            activeScreen = ConsoleScreen.IN_FLIGHT
            return
        }
        applyEvent(FlightEventType.INSPECTION_ZONE_REACHED, TransitionContext(missionUploaded = true))
        inspection = inspection.copy(
            captureStatus = ScreenDataState.PARTIAL,
            alignmentStatus = "Approaching viewpoint",
            framingHints = listOf("Center facade edge", "Hold 12 m standoff", "Yaw 225 deg"),
            reason = "Low-speed approach only",
            captureEnabled = false
        )
        activeScreen = ConsoleScreen.INSPECTION
    }

    fun alignView() {
        if (!isInStage(FlightStage.APPROACH_VIEWPOINT, FlightStage.VIEW_ALIGN)) {
            inspection = inspection.copy(
                captureStatus = ScreenDataState.ERROR,
                reason = "Reach the inspection approach stage before alignment.",
                captureEnabled = false
            )
            activeScreen = ConsoleScreen.INSPECTION
            return
        }
        applyEvent(FlightEventType.VIEW_ALIGN_OK, TransitionContext(missionUploaded = true))
        inspection = inspection.copy(
            captureStatus = ScreenDataState.PARTIAL,
            alignmentStatus = "View aligned, ready to capture",
            reason = "Stable hover achieved",
            captureEnabled = flightState.stage == FlightStage.VIEW_ALIGN
        )
    }

    fun captureView() {
        if (flightState.stage != FlightStage.VIEW_ALIGN) {
            inspection = inspection.copy(
                captureStatus = ScreenDataState.PARTIAL,
                reason = "Align viewpoint before capture",
                captureEnabled = false
            )
            return
        }
        val stateAfterCapture = if (flightState.stage == FlightStage.VIEW_ALIGN) {
            reducer.reduce(flightState, FlightEventType.VIEW_ALIGN_OK, TransitionContext(missionUploaded = true))
        } else {
            flightState
        }
        flightState = stateAfterCapture
        flightState = reducer.reduce(
            stateAfterCapture,
            FlightEventType.VIEW_ALIGN_OK,
            TransitionContext(
                missionUploaded = true,
                captureComplete = true,
                hasRemainingViewpoints = false
            )
        )
        inspection = inspection.copy(
            captureStatus = ScreenDataState.SUCCESS,
            alignmentStatus = "Capture complete",
            reason = "Aircraft transitioned to hold",
            captureEnabled = false
        )
        syncFromFlightState()
        activeScreen = ConsoleScreen.EMERGENCY
    }

    fun requestHold() {
        applyEvent(FlightEventType.USER_HOLD_REQUESTED, TransitionContext(missionUploaded = flightState.missionUploaded))
        activeScreen = ConsoleScreen.EMERGENCY
    }

    fun requestRth() {
        applyEvent(FlightEventType.USER_RTH_REQUESTED, TransitionContext(missionUploaded = flightState.missionUploaded))
        activeScreen = ConsoleScreen.EMERGENCY
    }

    fun completeRthLanding() {
        when (flightState.stage) {
            FlightStage.RTH -> applyEvent(FlightEventType.USER_RTH_REQUESTED, TransitionContext(rthArrived = true))
            FlightStage.LANDING -> applyEvent(FlightEventType.USER_RTH_REQUESTED, TransitionContext(landingComplete = true))
            else -> return
        }
        activeScreen = ConsoleScreen.EMERGENCY
    }

    fun requestTakeover() {
        applyEvent(FlightEventType.USER_TAKEOVER_REQUESTED, TransitionContext(missionUploaded = flightState.missionUploaded))
        activeScreen = ConsoleScreen.EMERGENCY
    }

    fun abortManual() {
        if (flightState.stage != FlightStage.MANUAL_OVERRIDE) {
            return
        }
        applyEvent(FlightEventType.USER_TAKEOVER_REQUESTED, TransitionContext(manualOverrideAborted = true))
        activeScreen = ConsoleScreen.EMERGENCY
    }

    private fun applyEvent(event: FlightEventType, context: TransitionContext = TransitionContext()) {
        flightState = reducer.reduce(flightState, event, context)
        syncFromFlightState()
    }

    private fun syncFromFlightState() {
        transit = transit.copy(
            stateLabel = flightState.stage.name,
            emergencyVisible = true,
            status = when (flightState.stage) {
                FlightStage.IDLE -> ScreenDataState.EMPTY
                FlightStage.HOLD,
                FlightStage.MANUAL_OVERRIDE,
                FlightStage.RTH,
                FlightStage.LANDING -> ScreenDataState.PARTIAL
                FlightStage.COMPLETED -> ScreenDataState.SUCCESS
                else -> ScreenDataState.SUCCESS
            },
            progressLabel = when (flightState.stage) {
                FlightStage.IDLE -> "Awaiting mission"
                FlightStage.TRANSIT -> "Mission corridor active"
                FlightStage.BRANCH_VERIFY -> "Waiting for branch confirmation"
                FlightStage.LOCAL_AVOID -> "Local avoidance active"
                FlightStage.APPROACH_VIEWPOINT -> "Approaching inspection viewpoint"
                FlightStage.VIEW_ALIGN -> "View alignment in progress"
                FlightStage.CAPTURE -> "Capture sequence active"
                FlightStage.HOLD -> "Aircraft holding"
                FlightStage.RTH -> "Returning home"
                FlightStage.LANDING -> "Landing in progress"
                FlightStage.COMPLETED -> "Mission complete"
                FlightStage.MANUAL_OVERRIDE -> "Operator has control"
                FlightStage.ABORTED -> "Mission aborted"
                else -> "Mission ready"
            },
            telemetry = defaultTelemetry(flightState.stage.name),
            riskReason = flightState.holdReason,
            nextStep = when (flightState.stage) {
                FlightStage.IDLE -> "Load mission bundle"
                FlightStage.PRECHECK -> "Approve preflight"
                FlightStage.MISSION_READY -> "Upload mission"
                FlightStage.TRANSIT -> "Monitor corridor and triggers"
                FlightStage.HOLD -> "Choose RTH or takeover"
                FlightStage.RTH -> "Wait for landing"
                FlightStage.MANUAL_OVERRIDE -> "Pilot flies manually"
                FlightStage.COMPLETED -> "Reset for next demo"
                FlightStage.ABORTED -> "Reload mission if needed"
                else -> "Continue workflow"
            }
        )

        emergency = when (flightState.stage) {
            FlightStage.HOLD -> EmergencyUiState(
                reason = flightState.holdReason ?: "Aircraft holding",
                mode = EmergencyMode.HOLD,
                nextStep = "Resume is intentionally disabled. Choose RTH or takeover.",
                primaryActionLabel = "Landing unavailable",
                secondaryActionLabel = "Abort Manual",
                completeLandingEnabled = false,
                abortManualEnabled = false
            )

            FlightStage.RTH -> EmergencyUiState(
                reason = "Return-to-home in progress",
                mode = EmergencyMode.RTH,
                nextStep = "Mark RTH arrival when the aircraft reaches home point.",
                primaryActionLabel = "Mark RTH Arrived",
                secondaryActionLabel = "Abort Manual",
                completeLandingEnabled = true,
                abortManualEnabled = false
            )

            FlightStage.MANUAL_OVERRIDE -> EmergencyUiState(
                reason = "Manual override active",
                mode = EmergencyMode.TAKEOVER,
                nextStep = "Pilot has authority. End manually or abort mission.",
                primaryActionLabel = "Landing unavailable",
                secondaryActionLabel = "Abort Manual",
                completeLandingEnabled = false,
                abortManualEnabled = true
            )

            FlightStage.LANDING -> EmergencyUiState(
                reason = "Landing in progress",
                mode = EmergencyMode.RTH,
                nextStep = "Keep landing zone clear, then complete landing.",
                primaryActionLabel = "Complete Landing",
                secondaryActionLabel = "Abort Manual",
                completeLandingEnabled = true,
                abortManualEnabled = false
            )

            FlightStage.COMPLETED -> EmergencyUiState(
                reason = "Mission completed safely",
                mode = EmergencyMode.INFO,
                nextStep = "Reload demo mission for next run",
                primaryActionLabel = "Landing complete",
                secondaryActionLabel = "Abort Manual",
                completeLandingEnabled = false,
                abortManualEnabled = false
            )

            FlightStage.ABORTED -> EmergencyUiState(
                reason = "Mission aborted",
                mode = EmergencyMode.TAKEOVER,
                nextStep = "Review reason before re-running",
                primaryActionLabel = "Landing unavailable",
                secondaryActionLabel = "Manual already aborted",
                completeLandingEnabled = false,
                abortManualEnabled = false
            )

            else -> EmergencyUiState(
                reason = "No active fail-safe",
                mode = EmergencyMode.INFO,
                nextStep = "Stay ready on HOLD / RTH / TAKEOVER rail",
                primaryActionLabel = "Landing unavailable",
                secondaryActionLabel = "Abort Manual",
                completeLandingEnabled = false,
                abortManualEnabled = false
            )
        }
    }

    companion object {
        private fun defaultTelemetry(stage: String): List<TelemetryField> = listOf(
            TelemetryField("Stage", stage),
            TelemetryField("Altitude", "35.0 m"),
            TelemetryField("Speed", "0.0-4.0 m/s"),
            TelemetryField("Battery", "78%"),
            TelemetryField("Policy", "HOLD first")
        )
    }

    private fun isInStage(vararg expected: FlightStage): Boolean = flightState.stage in expected
}
