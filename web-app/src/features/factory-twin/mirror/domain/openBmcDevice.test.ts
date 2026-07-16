import { describe, expect, it } from 'vitest';

import { buildOpenBmcSceneDevice, OPENBMC_PI5_ENTITY_ID } from './openBmcDevice';

describe('buildOpenBmcSceneDevice', () => {
  it.each([
    ['loading', 'live'],
    ['live', 'live'],
    ['stale', 'live'],
    ['simulated', 'sim'],
    ['unavailable', 'live'],
  ] as const)('maps %s presentation state without changing the stable identity', (mode, source) => {
    const entity = buildOpenBmcSceneDevice(mode);

    expect(entity).toMatchObject({
      id: OPENBMC_PI5_ENTITY_ID,
      type: 'device',
      deviceKind: 'openbmc_pi5',
      status: mode,
      source,
      attrs: {
        presentationOnly: true,
        approximatePosition: true,
        sourceMode: mode,
      },
    });
  });
});
