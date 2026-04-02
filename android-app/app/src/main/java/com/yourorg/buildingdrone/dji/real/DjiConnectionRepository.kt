package com.yourorg.buildingdrone.dji.real

import com.yourorg.buildingdrone.dji.DeviceHealthState
import com.yourorg.buildingdrone.dji.FlyZoneState
import com.yourorg.buildingdrone.dji.HardwareSnapshot
import com.yourorg.buildingdrone.dji.HardwareStatusProvider
import com.yourorg.buildingdrone.dji.UserAccountState
import dji.sdk.keyvalue.key.FlightControllerKey
import dji.sdk.keyvalue.key.KeyTools
import dji.sdk.keyvalue.key.ProductKey
import dji.sdk.keyvalue.key.RemoteControllerKey
import dji.sdk.keyvalue.value.flightcontroller.GPSSignalLevel
import dji.sdk.keyvalue.value.product.ProductType
import dji.v5.manager.KeyManager
import dji.v5.manager.SDKManager
import dji.v5.manager.account.LoginInfoUpdateListener
import dji.v5.manager.account.UserAccountManager
import dji.v5.manager.aircraft.flysafe.FlySafeNotificationListener
import dji.v5.manager.aircraft.flysafe.FlyZoneManager
import dji.v5.manager.diagnostic.DJIDeviceHealthInfo
import dji.v5.manager.diagnostic.DJIDeviceHealthInfoChangeListener
import dji.v5.manager.diagnostic.DJIDeviceStatus
import dji.v5.manager.diagnostic.DeviceHealthManager
import dji.v5.manager.diagnostic.DeviceStatusManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class DjiConnectionRepository(
    private val gateway: Gateway = RealGateway()
) : HardwareStatusProvider {
    interface Gateway {
        fun registered(): Boolean
        fun aircraftConnected(): Boolean
        fun remoteControllerConnected(): Boolean
        fun productType(): String?
        fun firmwareVersion(): String?
        fun gpsSatelliteCount(): Int
        fun gpsSignalLevel(): String?
        fun userAccountState(): UserAccountState
        fun deviceHealthState(): DeviceHealthState
        fun flyZoneState(): FlyZoneState
    }

    private val mutableState = MutableStateFlow(HardwareSnapshot())

    val state: StateFlow<HardwareSnapshot> = mutableState.asStateFlow()

    override fun currentSnapshot(): HardwareSnapshot = refresh()

    fun refresh(): HardwareSnapshot {
        val snapshot = HardwareSnapshot(
            sdkRegistered = gateway.registered(),
            aircraftConnected = gateway.aircraftConnected(),
            remoteControllerConnected = gateway.remoteControllerConnected(),
            productType = gateway.productType(),
            firmwareVersion = gateway.firmwareVersion(),
            gpsSatelliteCount = gateway.gpsSatelliteCount(),
            gpsSignalLevel = gateway.gpsSignalLevel(),
            userAccount = gateway.userAccountState(),
            deviceHealth = gateway.deviceHealthState(),
            flyZone = gateway.flyZoneState()
        )
        mutableState.value = snapshot
        return snapshot
    }

    private class RealGateway : Gateway {
        private var latestHealthInfos: List<DJIDeviceHealthInfo> = emptyList()
        private var latestFlyZone = FlyZoneState()

        private val healthListener = DJIDeviceHealthInfoChangeListener {
            @Suppress("UNCHECKED_CAST")
            latestHealthInfos = it as? List<DJIDeviceHealthInfo> ?: emptyList()
        }

        private val loginListener = LoginInfoUpdateListener { }

        private val flySafeListener = object : FlySafeNotificationListener {
            override fun onWarningNotificationUpdate(info: dji.v5.manager.aircraft.flysafe.info.FlySafeWarningInformation) {
                latestFlyZone = FlyZoneState(blocking = true, summary = info.toString())
            }

            override fun onSeriousWarningNotificationUpdate(info: dji.v5.manager.aircraft.flysafe.info.FlySafeSeriousWarningInformation) {
                latestFlyZone = FlyZoneState(blocking = true, summary = info.toString())
            }

            override fun onReturnToHomeNotificationUpdate(info: dji.v5.manager.aircraft.flysafe.info.FlySafeReturnToHomeInformation) {
                latestFlyZone = FlyZoneState(blocking = true, summary = info.toString())
            }

            override fun onTipNotificationUpdate(info: dji.v5.manager.aircraft.flysafe.info.FlySafeTipInformation) {
                if (latestFlyZone.summary == null) {
                    latestFlyZone = FlyZoneState(blocking = false, summary = info.toString())
                }
            }

            override fun onSurroundingFlyZonesUpdate(infos: MutableList<dji.v5.manager.aircraft.flysafe.info.FlyZoneInformation>) {
                if (infos.isEmpty()) {
                    latestFlyZone = FlyZoneState()
                }
            }
        }

        init {
            DeviceHealthManager.getInstance().addDJIDeviceHealthInfoChangeListener(healthListener)
            UserAccountManager.getInstance().addLoginInfoUpdateListener(loginListener)
            FlyZoneManager.getInstance().addFlySafeNotificationListener(flySafeListener)
        }

        override fun registered(): Boolean = SDKManager.getInstance().isRegistered

        override fun aircraftConnected(): Boolean =
            KeyManager.getInstance().getValue(KeyTools.createKey(FlightControllerKey.KeyConnection), false)

        override fun remoteControllerConnected(): Boolean =
            KeyManager.getInstance().getValue(KeyTools.createKey(RemoteControllerKey.KeyConnection), false)

        override fun productType(): String? =
            KeyManager.getInstance().getValue(KeyTools.createKey(ProductKey.KeyProductType), ProductType.UNKNOWN).name

        override fun firmwareVersion(): String? =
            KeyManager.getInstance().getValue(KeyTools.createKey(ProductKey.KeyFirmwareVersion), "")

        override fun gpsSatelliteCount(): Int =
            KeyManager.getInstance().getValue(KeyTools.createKey(FlightControllerKey.KeyGPSSatelliteCount), 0)

        override fun gpsSignalLevel(): String? =
            KeyManager.getInstance().getValue(KeyTools.createKey(FlightControllerKey.KeyGPSSignalLevel), GPSSignalLevel.LEVEL_0).name

        override fun userAccountState(): UserAccountState {
            val loginInfo = UserAccountManager.getInstance().loginInfo
            return UserAccountState(
                loggedIn = !loginInfo.account.isNullOrBlank(),
                accountId = loginInfo.account
            )
        }

        override fun deviceHealthState(): DeviceHealthState {
            val status = DeviceStatusManager.getInstance().currentDJIDeviceStatus
            val summary = latestHealthInfos.firstOrNull()?.description() ?: status.name
            return DeviceHealthState(
                blocking = status != DJIDeviceStatus.NORMAL,
                summary = summary
            )
        }

        override fun flyZoneState(): FlyZoneState = latestFlyZone
    }
}
