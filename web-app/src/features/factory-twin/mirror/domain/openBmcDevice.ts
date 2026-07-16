import type { DeviceEntity } from './entities';

export const OPENBMC_PI5_ENTITY_ID = 'device-openbmc-pi5';

export type OpenBmcSceneSourceMode = 'loading' | 'live' | 'stale' | 'simulated' | 'unavailable';

export function buildOpenBmcSceneDevice(
  sourceMode: OpenBmcSceneSourceMode,
): DeviceEntity {
  return {
    id: OPENBMC_PI5_ENTITY_ID,
    type: 'device',
    deviceKind: 'openbmc_pi5',
    name: 'Pi5 / OpenBMC 節點',
    position: { x: 2.8, y: 0, z: -0.8 },
    status: sourceMode,
    source: sourceMode === 'simulated' ? 'sim' : 'live',
    aliases: ['Pi5', 'Raspberry Pi 5', 'OpenBMC', 'OpenBMC Pi5'],
    subsystemId: 'sub-openbmc',
    attrs: {
      presentationOnly: true,
      approximatePosition: true,
      sourceMode,
    },
  };
}
