package com.yourorg.buildingdrone.dji.real

import com.yourorg.buildingdrone.dji.VirtualStickAdapter
import com.yourorg.buildingdrone.dji.VirtualStickCommand
import com.yourorg.buildingdrone.dji.VirtualStickStatus
import com.yourorg.buildingdrone.dji.VirtualStickWindow
import dji.sdk.keyvalue.value.flightcontroller.FlightCoordinateSystem
import dji.sdk.keyvalue.value.flightcontroller.RollPitchControlMode
import dji.sdk.keyvalue.value.flightcontroller.VerticalControlMode
import dji.sdk.keyvalue.value.flightcontroller.VirtualStickFlightControlParam
import dji.sdk.keyvalue.value.flightcontroller.YawControlMode
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.v5.manager.aircraft.virtualstick.VirtualStickManager
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

class DjiVirtualStickAdapter(
    private val gateway: Gateway = RealGateway()
) : VirtualStickAdapter {
    interface Gateway {
        fun enable(callback: CommonCallbacks.CompletionCallback)
        fun disable(callback: CommonCallbacks.CompletionCallback)
        fun setAdvancedModeEnabled(enabled: Boolean)
        fun send(command: VirtualStickCommand)
    }

    private var status = VirtualStickStatus()

    override suspend fun enable(window: VirtualStickWindow): Boolean {
        val enabled = suspendCompletion { gateway.enable(it) }
        if (enabled) {
            gateway.setAdvancedModeEnabled(true)
            status = VirtualStickStatus(enabled = true, activeWindow = window)
        }
        return enabled
    }

    override suspend fun disable(): Boolean {
        val disabled = suspendCompletion { gateway.disable(it) }
        if (disabled) {
            gateway.setAdvancedModeEnabled(false)
            status = VirtualStickStatus()
        }
        return disabled
    }

    override suspend fun send(command: VirtualStickCommand): Boolean {
        if (!status.enabled || status.activeWindow == null) {
            status = status.copy(lastError = "Virtual stick window is not active")
            return false
        }

        gateway.send(command)
        return true
    }

    override fun status(): VirtualStickStatus = status

    private suspend fun suspendCompletion(
        block: (CommonCallbacks.CompletionCallback) -> Unit
    ): Boolean = suspendCoroutine { continuation ->
        block(object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() {
                continuation.resume(true)
            }

            override fun onFailure(error: IDJIError) {
                continuation.resume(false)
            }
        })
    }

    private class RealGateway : Gateway {
        override fun enable(callback: CommonCallbacks.CompletionCallback) {
            VirtualStickManager.getInstance().enableVirtualStick(callback)
        }

        override fun disable(callback: CommonCallbacks.CompletionCallback) {
            VirtualStickManager.getInstance().disableVirtualStick(callback)
        }

        override fun setAdvancedModeEnabled(enabled: Boolean) {
            VirtualStickManager.getInstance().setVirtualStickAdvancedModeEnabled(enabled)
        }

        override fun send(command: VirtualStickCommand) {
            val param = VirtualStickFlightControlParam().apply {
                setRollPitchCoordinateSystem(FlightCoordinateSystem.BODY)
                setVerticalControlMode(VerticalControlMode.VELOCITY)
                setYawControlMode(YawControlMode.ANGULAR_VELOCITY)
                setRollPitchControlMode(RollPitchControlMode.VELOCITY)
                setPitch(command.pitch.toDouble())
                setRoll(command.roll.toDouble())
                setYaw(command.yaw.toDouble())
                setVerticalThrottle(command.throttle.toDouble())
            }
            VirtualStickManager.getInstance().sendVirtualStickAdvancedParam(param)
        }
    }
}
