import '@testing-library/jest-dom/vitest';

import { act, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../../test/utils';
import type { OpenBmcDevice } from '../../../../lib/types';
import type { MachineEntity, PersonEntity } from '../domain/entities';
import { buildDemoScenarioEntities } from '../domain/demoScenarios';
import { useFactoryStore } from '../store/factoryStore';
import { useWarehouseDemoStore } from '../store/warehouseDemoStore';
import {
  compactEntities,
  buildWorldSnapshot,
  DEMO_TWIN_AGENT_SESSION_ID,
  TWIN_AGENT_SESSION_ID,
  useTwinAgentBridge,
  type TwinAgentBridgeOptions,
  type TwinAgentLiveDataStatus,
} from './useTwinAgentBridge';

const apiMock = vi.hoisted(() => ({
  postTwinAgentSnapshot: vi.fn(),
  postTwinAgentMessage: vi.fn(),
  getTwinAgentUpdates: vi.fn(),
}));

vi.mock('../../../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../../../lib/api')>('../../../../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      postTwinAgentSnapshot: apiMock.postTwinAgentSnapshot,
      postTwinAgentMessage: apiMock.postTwinAgentMessage,
      getTwinAgentUpdates: apiMock.getTwinAgentUpdates,
    },
  };
});

const toolsMock = vi.hoisted(() => ({
  executeToolCall: vi.fn(() => ({ ok: true, message: '已標示 1 個對象' })),
}));

vi.mock('../agent/tools', () => ({ executeToolCall: toolsMock.executeToolCall }));

function Harness({
  liveDataStatus,
  options,
}: {
  liveDataStatus?: TwinAgentLiveDataStatus;
  options?: TwinAgentBridgeOptions;
}) {
  useTwinAgentBridge(liveDataStatus, options);
  return null;
}

function machineFixture(id: string, x = 0): MachineEntity {
  return {
    id,
    type: 'machine',
    name: id.toUpperCase(),
    position: { x, y: 0, z: -3.14 },
    status: 'running',
    source: 'sim',
    model: 'HC600',
    oee: 87,
    temperature: 71,
    cycleTimeSec: 32,
    todayCount: 120,
    alarms: 0,
  };
}

const livePerson: PersonEntity = {
  id: 'live-1',
  type: 'person',
  name: '現場人員 1',
  role: 'anonymous-presence',
  position: { x: 1.26, y: 0, z: 2 },
  status: 'on-duty',
  source: 'live',
};

function openBmcDeviceFixture(overrides: Partial<OpenBmcDevice> = {}): OpenBmcDevice {
  const observedAt = new Date().toISOString();
  return {
    deviceId: 'pi5-device',
    organizationId: 'openbmc-org-secret',
    siteId: 'site-1',
    connectorId: 'openbmc-connector-secret',
    name: 'Pi5 OpenBMC Demo',
    externalRef: 'pi5-demo',
    deviceType: 'raspberry_pi_5',
    status: 'active',
    capabilities: { commandTypes: ['fan_boost'] },
    freshness: 'fresh',
    canControl: true,
    controlEligible: true,
    controlBlockReasons: [],
    lastObservedAt: observedAt,
    lastIngestedAt: observedAt,
    latestObservation: {
      observationId: 'obs-1',
      sourceObservationId: 'collector:1',
      observedAt,
      collectorReceivedAt: observedAt,
      ingestedAt: observedAt,
      collectorStale: false,
      temperatureC: 57.3,
      status: 'normal',
      health: 'ok',
      fan: {
        present: true,
        rpm: 1184,
        pwm: 75,
        coolingState: 1,
        coolingMaxState: 4,
        manualBoostSupported: true,
      },
      thresholds: { warningC: 65, criticalC: 75 },
    },
    recentEvents: [
      {
        eventId: 'evt-1',
        sourceEventKey: 'collector:evt-1',
        occurredAt: observedAt,
        severity: 'info',
        source: 'collector_event',
        code: 'THRESHOLD_STATE',
        message: 'QEMU threshold state changed from Unknown to Normal at 56.75C.',
        details: {},
      },
    ],
    recentCommands: [
      {
        commandId: 'openbmc-command-secret',
        type: 'fan_boost',
        arguments: { seconds: 10 },
        status: 'succeeded',
        reason: '不得送進展示助手的命令紀錄',
        proposalHash: 'hash-1',
        proposedAt: observedAt,
        confirmationExpiresAt: null,
        confirmedAt: observedAt,
        claimExpiresAt: null,
        completedAt: observedAt,
        failureCode: null,
        result: null,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useFactoryStore.setState(useFactoryStore.getInitialState(), true);
  useWarehouseDemoStore.getState().disable();
});

it('isolates accelerator demo snapshots from Jingcheng live evidence and organization routing', async () => {
  apiMock.getTwinAgentUpdates.mockResolvedValue({ workerOnline: true, events: [], cursor: 0 });
  apiMock.postTwinAgentSnapshot.mockResolvedValue(undefined);
  useFactoryStore.getState().setEntities({
    ...buildDemoScenarioEntities('plan_gap'),
    [livePerson.id]: livePerson,
  });
  useFactoryStore.getState().setLivePersons([livePerson]);
  useFactoryStore.getState().setPlatformCameras([
    {
      id: 'fw-camera-live',
      type: 'camera',
      name: '靚程授權攝影機',
      position: { x: 0, y: 0, z: 0 },
      status: 'active',
      source: 'live',
      siteLabel: '靚程工廠',
      online: true,
      samplingIntervalSeconds: 10,
      feedMode: 'snapshot',
      attrs: {
        platformOrganizationId: 'jingcheng-org',
        latestOcrObservation: { gptSummary: { summary: '不得送進展示助手' } },
        latestPersonObservation: { personCount: 1 },
      },
    },
  ]);
  useWarehouseDemoStore.getState().initialize();

  renderWithProviders(
    <Harness
      liveDataStatus={{
        mode: 'simulation',
        cameraState: 'ready',
        cameraCount: 1,
        cameraLatestAt: new Date().toISOString(),
        personState: 'current',
        personLatestAt: new Date().toISOString(),
      }}
      options={{
        sessionId: DEMO_TWIN_AGENT_SESSION_ID,
        snapshotScope: 'accelerator_demo',
        includeLiveEvidence: false,
        demoScenarioId: 'plan_gap',
      }}
    />,
  );

  await waitFor(() => expect(apiMock.postTwinAgentSnapshot).toHaveBeenCalled());
  const [, payload] = apiMock.postTwinAgentSnapshot.mock.calls[0];
  expect(payload.sessionId).toBe(DEMO_TWIN_AGENT_SESSION_ID);
  expect(payload.snapshotScope).toBe('accelerator_demo');
  expect(payload).not.toHaveProperty('organizationId');
  expect(payload.world.dataAvailability).toMatchObject({
    mode: 'simulation',
    camera: { state: 'out_of_scope', count: 0 },
    people: { state: 'simulation' },
    amr: { state: 'simulation' },
  });
  expect(payload.world.entities.every((entity: { dataSource?: string; type: string }) => entity.dataSource !== 'live')).toBe(true);
  expect(payload.world.cameraSummary).toEqual([]);
  expect(payload.world.machineRealData).toEqual([]);
  expect(payload.world.simulationContext).toMatchObject({
    scenarioId: 'plan_gap',
    totals: { plan: 2460, actual: 1704, delta: -756 },
    warehouseDecision: {
      source: 'simulation',
      status: 'ready',
      scenario: { demandChange: 'A 系列需求 +40%' },
    },
  });
  expect(payload.world.experience).toEqual({
    snapshotScope: 'accelerator_demo',
    facilitySpace: 'factory',
  });
  expect(JSON.stringify(payload.world.simulationContext.warehouseDecision).length).toBeLessThan(20_000);
  expect(JSON.stringify(payload.world)).not.toContain('不得送進展示助手');
  expect(JSON.stringify(payload.world)).not.toContain('jingcheng-org');
});

it('rejects demo context from an organization snapshot even when the caller passes demo options', () => {
  useWarehouseDemoStore.getState().initialize();
  useWarehouseDemoStore.getState().beginTransition('warehouse');
  useWarehouseDemoStore.getState().completeTransition();

  const world = buildWorldSnapshot(undefined, {
    snapshotScope: 'organization_live',
    includeLiveEvidence: true,
    demoScenarioId: 'plan_gap',
  });

  expect(world.experience).toEqual({ snapshotScope: 'organization_live', facilitySpace: 'factory' });
  expect(world).not.toHaveProperty('simulationContext');
});

it('includes a read-only openBmc summary for current authorized live data', () => {
  useFactoryStore.getState().setEntities(buildDemoScenarioEntities('normal'));

  const world = buildWorldSnapshot(undefined, {
    snapshotScope: 'accelerator_demo',
    includeLiveEvidence: false,
    demoScenarioId: 'normal',
    openBmc: { sourceMode: 'live', device: openBmcDeviceFixture() },
  });

  expect(world.openBmc).toMatchObject({
    entityId: 'device-openbmc-pi5',
    deviceName: 'Pi5 OpenBMC Demo',
    source: 'authorized_live',
    state: 'current',
    temperatureC: 57.3,
    status: 'normal',
    health: 'ok',
    fan: { present: true, rpm: 1184, pwm: 75 },
    thresholds: { warningC: 65, criticalC: 75 },
  });
  expect(world.dataAvailability).toMatchObject({
    openBmc: { state: 'current', source: 'authorized_live' },
  });
  const serialized = JSON.stringify(world.openBmc);
  expect(serialized).not.toContain('capabilit');
  expect(serialized).not.toContain('canControl');
  expect(serialized).not.toContain('controlEligible');
  expect(serialized).not.toContain('fan_boost');
  expect(serialized).not.toContain('openbmc-connector-secret');
  expect(serialized).not.toContain('openbmc-org-secret');
  expect(serialized).not.toContain('openbmc-command-secret');
  expect(serialized).not.toContain('不得送進展示助手的命令紀錄');
});

it('fails closed to a stale openBmc summary without telemetry values', () => {
  const world = buildWorldSnapshot(undefined, {
    snapshotScope: 'accelerator_demo',
    includeLiveEvidence: false,
    openBmc: { sourceMode: 'live', device: openBmcDeviceFixture({ freshness: 'stale' }) },
  });

  expect(world.openBmc).toMatchObject({
    source: 'authorized_live',
    state: 'stale',
    text: expect.stringContaining('已過期'),
  });
  expect(world.openBmc).not.toHaveProperty('temperatureC');
  expect(world.openBmc).not.toHaveProperty('fan');
  // 事件 message 內嵌溫度數字，stale 分支必須整組排除。
  expect(world.openBmc).not.toHaveProperty('recentEvents');
  expect(JSON.stringify(world.openBmc)).not.toContain('56.75C');
  expect(world.dataAvailability).toMatchObject({
    openBmc: { state: 'stale', source: 'authorized_live' },
  });
});

it('fails closed when the collector marks the reading stale even if the server flag is fresh', () => {
  const device = openBmcDeviceFixture();
  device.latestObservation = { ...device.latestObservation!, collectorStale: true };

  const world = buildWorldSnapshot(undefined, {
    snapshotScope: 'accelerator_demo',
    includeLiveEvidence: false,
    openBmc: { sourceMode: 'live', device },
  });

  expect(world.openBmc).toMatchObject({ state: 'stale' });
  expect(world.openBmc).not.toHaveProperty('temperatureC');
});

it('fails closed when the observation is older than the 30-second live window', () => {
  const past = new Date(Date.now() - 40_000).toISOString();
  const device = openBmcDeviceFixture();
  device.latestObservation = { ...device.latestObservation!, observedAt: past };

  const world = buildWorldSnapshot(undefined, {
    snapshotScope: 'accelerator_demo',
    includeLiveEvidence: false,
    openBmc: { sourceMode: 'live', device },
  });

  expect(world.openBmc).toMatchObject({ state: 'stale' });
  expect(world.openBmc).not.toHaveProperty('temperatureC');
});

it('reports a live device that never produced an observation as missing, not stale', () => {
  const device = openBmcDeviceFixture({ latestObservation: null, lastObservedAt: null });

  const world = buildWorldSnapshot(undefined, {
    snapshotScope: 'accelerator_demo',
    includeLiveEvidence: false,
    openBmc: { sourceMode: 'live', device },
  });

  expect(world.openBmc).toMatchObject({
    state: 'missing',
    text: expect.stringContaining('尚未收到任何觀測資料'),
  });
  expect(world.openBmc).not.toHaveProperty('temperatureC');
});

it('marks the openBmc source as loading during the initial fetch', () => {
  const world = buildWorldSnapshot(undefined, {
    snapshotScope: 'accelerator_demo',
    includeLiveEvidence: false,
    openBmc: { sourceMode: 'loading', device: null },
  });

  expect(world.openBmc).toMatchObject({
    source: 'loading',
    state: 'loading',
    text: expect.stringContaining('載入中'),
  });
});

it('keeps the openBmc summary out of non-demo snapshot scopes', () => {
  const world = buildWorldSnapshot(undefined, {
    snapshotScope: 'organization_live',
    includeLiveEvidence: true,
    openBmc: { sourceMode: 'live', device: openBmcDeviceFixture() },
  });

  expect(world).not.toHaveProperty('openBmc');
  expect(world.dataAvailability).not.toHaveProperty('openBmc');
});

it('publishes world.openBmc through the bridge effect for accelerator demo sessions', async () => {
  apiMock.getTwinAgentUpdates.mockResolvedValue({ workerOnline: true, events: [], cursor: 0 });
  apiMock.postTwinAgentSnapshot.mockResolvedValue(undefined);
  useFactoryStore.getState().setEntities(buildDemoScenarioEntities('normal'));

  renderWithProviders(
    <Harness
      liveDataStatus={{
        mode: 'simulation',
        cameraState: 'ready',
        cameraCount: 0,
        cameraLatestAt: null,
        personState: 'unavailable',
        personLatestAt: null,
      }}
      options={{
        sessionId: DEMO_TWIN_AGENT_SESSION_ID,
        snapshotScope: 'accelerator_demo',
        includeLiveEvidence: false,
        demoScenarioId: 'normal',
        openBmc: { sourceMode: 'live', device: openBmcDeviceFixture() },
      }}
    />,
  );

  await waitFor(() => expect(apiMock.postTwinAgentSnapshot).toHaveBeenCalled());
  const [, payload] = apiMock.postTwinAgentSnapshot.mock.calls[0];
  expect(payload.world.openBmc).toMatchObject({
    source: 'authorized_live',
    state: 'current',
    temperatureC: 57.3,
  });
  expect(payload.world.dataAvailability.openBmc).toEqual({
    state: 'current',
    source: 'authorized_live',
  });
});

it('labels the simulated openBmc fixture as simulation data', () => {
  const world = buildWorldSnapshot(undefined, {
    snapshotScope: 'accelerator_demo',
    includeLiveEvidence: false,
    openBmc: { sourceMode: 'simulated', device: openBmcDeviceFixture() },
  });

  expect(world.openBmc).toMatchObject({
    source: 'simulation',
    state: 'current',
    temperatureC: 57.3,
  });
});

it('reports an unavailable openBmc source honestly and omits the block when unconfigured', () => {
  const unavailable = buildWorldSnapshot(undefined, {
    snapshotScope: 'accelerator_demo',
    includeLiveEvidence: false,
    openBmc: { sourceMode: 'unavailable', device: null },
  });
  const absent = buildWorldSnapshot(undefined, {
    snapshotScope: 'accelerator_demo',
    includeLiveEvidence: false,
  });

  expect(unavailable.openBmc).toMatchObject({ source: 'unavailable', state: 'unavailable' });
  expect(absent).not.toHaveProperty('openBmc');
  expect(absent.dataAvailability).not.toHaveProperty('openBmc');
});

it('processes feed events: reply into chat, commands executed and narrated', async () => {
  apiMock.getTwinAgentUpdates.mockResolvedValue({
    workerOnline: true,
    events: [
      { seq: 1, kind: 'reply', jobId: 'job-1', source: 'web', text: '機台狀態正常' },
      {
        seq: 2,
        kind: 'commands',
        jobId: 'job-1',
        source: 'web',
        toolCalls: [{ name: 'highlight_entity', arguments: { ids: ['m-1'] } }],
      },
    ],
    cursor: 2,
  });
  useFactoryStore.getState().incPendingAgentReplies();

  renderWithProviders(<Harness />);

  await waitFor(() => {
    expect(useFactoryStore.getState().cloudAgentOnline).toBe(true);
  });
  expect(apiMock.getTwinAgentUpdates).toHaveBeenCalledWith('test-token', TWIN_AGENT_SESSION_ID, null);
  const messages = useFactoryStore.getState().messages;
  expect(messages.some((m) => m.role === 'assistant' && m.text === '機台狀態正常')).toBe(true);
  expect(messages.some((m) => m.role === 'system' && m.text === '已標示 1 個對象')).toBe(true);
  expect(useFactoryStore.getState().pendingAgentReplies).toBe(0);
  expect(toolsMock.executeToolCall).toHaveBeenCalledTimes(1);
  expect(toolsMock.executeToolCall).toHaveBeenCalledWith({
    name: 'highlight_entity',
    arguments: { ids: ['m-1'] },
  });
});

it('processes each event once within its isolated session cursor', async () => {
  apiMock.getTwinAgentUpdates.mockResolvedValue({
    workerOnline: true,
    events: [
      {
        seq: 2,
        kind: 'commands',
        jobId: 'job-1',
        source: 'web',
        toolCalls: [{ name: 'highlight_entity', arguments: { ids: ['m-1'] } }],
      },
      {
        seq: 3,
        kind: 'commands',
        jobId: 'job-2',
        source: 'line',
        toolCalls: [{ name: 'focus_camera', arguments: { id: 'm-2' } }],
      },
    ],
    cursor: 3,
  });

  renderWithProviders(<Harness />);

  await waitFor(() => {
    expect(toolsMock.executeToolCall).toHaveBeenCalledTimes(2);
  });
  expect(apiMock.getTwinAgentUpdates).toHaveBeenCalledWith('test-token', TWIN_AGENT_SESSION_ID, null);
  expect(toolsMock.executeToolCall).toHaveBeenCalledWith({
    name: 'highlight_entity',
    arguments: { ids: ['m-1'] },
  });
  expect(toolsMock.executeToolCall).toHaveBeenCalledWith({
    name: 'focus_camera',
    arguments: { id: 'm-2' },
  });
});

it('keeps executing the batch and narrates the failure when a tool call throws', async () => {
  toolsMock.executeToolCall.mockImplementationOnce(() => {
    throw new TypeError('ref.trim is not a function');
  });
  apiMock.getTwinAgentUpdates.mockResolvedValue({
    workerOnline: true,
    events: [
      {
        seq: 10,
        kind: 'commands',
        jobId: 'job-3',
        source: 'web',
        toolCalls: [
          { name: 'set_machine_state', arguments: { machineId: 3, state: 'alarm' } },
          { name: 'highlight_entity', arguments: { ids: ['m-1'] } },
        ],
      },
    ],
    cursor: 10,
  });

  renderWithProviders(<Harness />);

  await waitFor(() => {
    expect(toolsMock.executeToolCall).toHaveBeenCalledTimes(2);
  });
  const messages = useFactoryStore.getState().messages;
  expect(
    messages.some(
      (m) => m.role === 'system' && m.text === '工具 set_machine_state 執行失敗\n已標示 1 個對象',
    ),
  ).toBe(true);
});

it('clears processed seqs when the server cursor regresses after a restart', async () => {
  apiMock.getTwinAgentUpdates.mockResolvedValue({
    workerOnline: true,
    events: [{ seq: 20, kind: 'reply', jobId: 'job-4', source: 'web', text: '重啟前' }],
    cursor: 20,
  });
  const first = renderWithProviders(<Harness />);
  await waitFor(() => {
    expect(useFactoryStore.getState().messages.some((m) => m.text === '重啟前')).toBe(true);
  });
  first.unmount();

  apiMock.getTwinAgentUpdates.mockResolvedValue({
    workerOnline: true,
    events: [{ seq: 1, kind: 'reply', jobId: 'job-5', source: 'web', text: '重啟後' }],
    cursor: 1,
  });
  renderWithProviders(<Harness />);

  await waitFor(() => {
    expect(useFactoryStore.getState().messages.some((m) => m.text === '重啟後')).toBe(true);
  });
});

it('marks the cloud agent offline when the updates query errors', async () => {
  useFactoryStore.getState().setCloudAgentOnline(true);
  apiMock.getTwinAgentUpdates.mockRejectedValue(new Error('server restarting'));

  renderWithProviders(<Harness />);

  await waitFor(() => {
    expect(useFactoryStore.getState().cloudAgentOnline).toBe(false);
  });
});

it('pushes a compact world snapshot every 3 seconds', () => {
  vi.useFakeTimers();
  try {
    apiMock.getTwinAgentUpdates.mockResolvedValue({ workerOnline: false, events: [], cursor: 3 });
    apiMock.postTwinAgentSnapshot.mockResolvedValue(undefined);
    useFactoryStore.getState().setEntities({ 'm-1': machineFixture('m-1', 1.26) });

    renderWithProviders(<Harness />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(apiMock.postTwinAgentSnapshot).toHaveBeenCalledTimes(2);
    const [token, payload] = apiMock.postTwinAgentSnapshot.mock.calls.at(-1)!;
    expect(token).toBe('test-token');
    expect(payload.sessionId).toBe(TWIN_AGENT_SESSION_ID);
    expect(typeof payload.capturedAt).toBe('string');
    expect(payload.world.entities).toEqual([
      {
        id: 'm-1',
        type: 'machine',
        name: 'M-1',
        status: 'running',
        position: { x: 1.3, y: 0, z: -3.1 },
        model: 'HC600',
        oee: 87,
        temperature: 71,
        todayCount: 120,
        alarms: 0,
      },
    ]);
    expect(payload.world.recentEvents).toEqual([]);
    expect(payload.world.cameraSummary).toEqual([]);
    expect(payload.world.machineRealData).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});

it('publishes loading and unavailable AMR states without turning them into zero live data', () => {
  apiMock.getTwinAgentUpdates.mockResolvedValue({ workerOnline: false, events: [], cursor: 0 });
  apiMock.postTwinAgentSnapshot.mockResolvedValue(undefined);

  renderWithProviders(
    <Harness
      liveDataStatus={{
        mode: 'live',
        cameraState: 'loading',
        cameraCount: null,
        cameraLatestAt: null,
        personState: 'loading',
        personLatestAt: null,
      }}
    />,
  );

  const [, payload] = apiMock.postTwinAgentSnapshot.mock.calls[0];
  expect(payload.world.dataAvailability).toMatchObject({
    camera: { state: 'loading', count: null },
    people: { state: 'loading' },
    amr: {
      state: 'not_connected',
      source: 'live',
      count: 0,
      text: '靚程工廠目前沒有接入真實 AMR 資料',
    },
  });
});

it('includes real gauge readings and the 派工單 sheet in the camera summary', () => {
  vi.useFakeTimers();
  try {
    apiMock.getTwinAgentUpdates.mockResolvedValue({ workerOnline: false, events: [], cursor: 0 });
    apiMock.postTwinAgentSnapshot.mockResolvedValue(undefined);
    const workOrder = {
      template: 'hc600_dispatch_sheet_v1',
      unit: 'PCS',
      sourceLineCount: 56,
      fields: { machineNo: { label: '機台編號', value: 'HC600', confidence: 0.82, rawText: 'HC600' } },
      quantities: {
        total: {
          label: '總計',
          left: { value: 210, confidence: 0.95, rawText: '210' },
          right: { value: 210, confidence: 0.97, rawText: '210' },
        },
      },
    };
    useFactoryStore.getState().setPlatformCameras([
      {
        id: 'fw-camera-panel',
        type: 'camera',
        name: 'PoE Camera 192.168.1.10',
        position: { x: 0, y: 0, z: 0 },
        status: 'active',
        source: 'live',
        siteLabel: '靚程工廠 / HC600-01',
        online: true,
        samplingIntervalSeconds: 10,
        feedMode: 'snapshot',
        attrs: {
          latestGaugeReadings: [
            {
              gaugeId: 'press_am_meter',
              label: 'PRESS AM METER',
              value: 0,
              unit: 'A',
              status: 'ok',
              capturedAt: '2026-07-05T19:35:59+08:00',
            },
          ],
          latestOcrObservation: {
            mode: 'temperature_monitor',
            capturedAt: '2026-07-05T19:40:00+08:00',
            gptSummary: { summary: 'HC600 保溫中。' },
            structuredFields: {
              workOrder,
              screenVisibility: { status: 'lit', confidence: 0.91, meanLuma: 120, p90Luma: 150, p98Luma: 180 },
            },
          },
        },
      } as never,
    ]);

    renderWithProviders(<Harness />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const [, payload] = apiMock.postTwinAgentSnapshot.mock.calls[0];
    const camera = payload.world.cameraSummary[0];
    expect(camera.name).toBe('PoE Camera 192.168.1.10');
    expect(camera.actualGaugeReadings).toEqual([
      expect.objectContaining({
        label: 'PRESS AM METER',
        value: 0,
        unit: 'A',
        status: 'ok',
        statusText: '正常',
        capturedAt: '2026-07-05T19:35:59+08:00',
        freshness: expect.objectContaining({ state: 'stale' }),
      }),
    ]);
    expect(camera.hmiOcr.summary).toBe('HC600 保溫中。');
    expect(camera.hmiOcr.workOrder).toEqual(workOrder);
    expect(camera.hmiOcr.workOrderReview).toMatchObject({
      status: 'pending_confirmation',
      statusText: '待確認',
    });
    expect(camera.hmiOcr.screenVisibility).toMatchObject({
      status: 'lit',
      statusText: '螢幕有亮，代表目前有開機跡象',
    });
  } finally {
    vi.useRealTimers();
  }
});

it('groups HC600-01 live camera readings, dispatch sheet, and nearby people by machine', () => {
  vi.useFakeTimers();
  try {
    apiMock.getTwinAgentUpdates.mockResolvedValue({ workerOnline: false, events: [], cursor: 0 });
    apiMock.postTwinAgentSnapshot.mockResolvedValue(undefined);
    const liveOnlyMachine: MachineEntity = {
      ...machineFixture('m-hc600', 0),
      name: 'HC600-01',
      status: 'unknown',
      source: 'live',
      attrs: { liveMetricsOnly: true },
      oee: 0,
      temperature: 0,
      todayCount: 0,
      alarms: 0,
    };
    const nearbyPerson: PersonEntity = {
      ...livePerson,
      id: 'live-near-hc600',
      position: { x: 1.2, y: 0.05, z: -1.2 },
      station: '操作側',
      attrs: {
        approximate: true,
        cameraLabel: '操作側',
        receivedAt: '2026-07-05T19:42:01+08:00',
        personCount: 2,
        confidence: 0.93,
      },
    };
    const workOrder = {
      template: 'hc600_dispatch_sheet_v1',
      unit: 'PCS',
      fields: { machineNo: { value: 'HC600-01' } },
    };

    useFactoryStore.getState().setEntities({ [liveOnlyMachine.id]: liveOnlyMachine });
    useFactoryStore.getState().setLivePersons([nearbyPerson]);
    useFactoryStore.getState().setPlatformCameras([
      {
        id: 'fw-camera-panel',
        type: 'camera',
        name: '操作側',
        position: { x: 0, y: 0, z: 0 },
        status: 'active',
        source: 'live',
        siteLabel: '靚程工廠 / HC600-01',
        online: true,
        samplingIntervalSeconds: 10,
        feedMode: 'snapshot',
        attrs: {
          latestGaugeReadings: [
            {
              label: 'PRESS AM METER',
              value: 4.2,
              unit: 'A',
              status: 'ok',
              capturedAt: '2026-07-05T19:41:59+08:00',
            },
          ],
          latestOcrObservation: {
            mode: 'machine_monitor',
            capturedAt: '2026-07-05T19:42:00+08:00',
            gptSummary: { summary: 'HMI 顯示機台正常，派工單已辨識。' },
            structuredFields: {
              workOrder,
              screenVisibility: { status: 'lit', confidence: 0.92, meanLuma: 121, p90Luma: 151, p98Luma: 181 },
            },
          },
          latestPersonObservation: {
            personCount: 2,
            capturedAt: '2026-07-05T19:42:00+08:00',
            receivedAt: '2026-07-05T19:42:01+08:00',
            detectorName: 'yolox',
            detections: [{ confidence: 0.93, floorPosition: { x: 1.23, z: -1.24 } }],
          },
        },
      } as never,
    ]);

    renderWithProviders(<Harness />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const [, payload] = apiMock.postTwinAgentSnapshot.mock.calls[0];
    const machine = payload.world.machineRealData[0];
    expect(machine).toMatchObject({
      machineId: 'm-hc600',
      machineName: 'HC600-01',
      screenPowerInference: {
        state: 'screen_lit',
        text: '螢幕有亮，代表目前有開機跡象',
        sourceCamera: '操作側',
        capturedAt: '2026-07-05T19:42:00+08:00',
        confidence: 0.92,
      },
      metricsSource: 'live',
      actualDataAvailable: true,
    });
    expect(machine).not.toHaveProperty('status');
    expect(machine.relatedCameras[0]).toMatchObject({
      id: 'fw-camera-panel',
      machineId: 'm-hc600',
      actualGaugeReadings: [
        {
          label: 'PRESS AM METER',
          value: 4.2,
          unit: 'A',
          status: 'ok',
          statusText: '正常',
          capturedAt: '2026-07-05T19:41:59+08:00',
        },
      ],
      hmiOcr: {
        summary: 'HMI 顯示機台正常，派工單已辨識。',
        workOrder,
        screenVisibility: { status: 'lit', statusText: '螢幕有亮，代表目前有開機跡象' },
      },
      actualPersonObservation: { personCount: 2 },
    });
    expect(machine.nearbyLivePersons).toEqual([
      expect.objectContaining({
        id: 'live-near-hc600',
        station: '操作側',
        sourceCamera: '操作側',
        personCount: 2,
        approximate: true,
        confidence: 0.9,
      }),
    ]);
  } finally {
    vi.useRealTimers();
  }
});

it('uses dark HMI screen visibility as the machine power evidence', () => {
  vi.useFakeTimers();
  try {
    apiMock.getTwinAgentUpdates.mockResolvedValue({ workerOnline: false, events: [], cursor: 0 });
    apiMock.postTwinAgentSnapshot.mockResolvedValue(undefined);
    const liveOnlyMachine: MachineEntity = {
      ...machineFixture('m-hc600', 0),
      name: 'HC600-01',
      status: 'unknown',
      source: 'live',
      attrs: { liveMetricsOnly: true },
      oee: 0,
      temperature: 0,
      todayCount: 0,
      alarms: 0,
    };

    useFactoryStore.getState().setEntities({ [liveOnlyMachine.id]: liveOnlyMachine });
    useFactoryStore.getState().setPlatformCameras([
      {
        id: 'fw-camera-panel',
        type: 'camera',
        name: '操作側',
        position: { x: 0, y: 0, z: 0 },
        status: 'active',
        source: 'live',
        siteLabel: '靚程工廠 / HC600-01',
        online: true,
        samplingIntervalSeconds: 10,
        feedMode: 'snapshot',
        attrs: {
          latestOcrObservation: {
            mode: 'unknown',
            capturedAt: '2026-07-05T20:00:00+08:00',
            gptSummary: {},
            structuredFields: {
              screenVisibility: { status: 'dark', confidence: 0.88, meanLuma: 25, p90Luma: 30, p98Luma: 40 },
            },
          },
        },
      } as never,
    ]);

    renderWithProviders(<Harness />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const [, payload] = apiMock.postTwinAgentSnapshot.mock.calls[0];
    expect(payload.world.machineRealData[0].screenPowerInference).toEqual({
      state: 'screen_dark',
      text: '螢幕是暗的',
      sourceCamera: '操作側',
      capturedAt: '2026-07-05T20:00:00+08:00',
      confidence: 0.88,
      freshness: expect.objectContaining({ state: 'stale' }),
    });
  } finally {
    vi.useRealTimers();
  }
});

it('caps snapshot entities at 150 and relabels live persons', () => {
  const entities: Record<string, MachineEntity | PersonEntity> = { [livePerson.id]: livePerson };
  for (let i = 0; i < 160; i += 1) {
    const machine = machineFixture(`m-${i}`, i);
    entities[machine.id] = machine;
  }

  const compact = compactEntities(entities);

  expect(compact).toHaveLength(150);
  const person = compact.find((entry) => entry.id === livePerson.id);
  expect(person).toMatchObject({ role: '現場人員', position: { x: 1.3, y: 0, z: 2 } });
});

it('omits placeholder machine metrics for live-only machines', () => {
  const liveOnlyMachine: MachineEntity = {
    ...machineFixture('m-hc600', 0),
    status: 'unknown',
    source: 'live',
    attrs: { liveMetricsOnly: true },
    oee: 0,
    temperature: 0,
    todayCount: 0,
    alarms: 0,
  };

  const [compact] = compactEntities({ [liveOnlyMachine.id]: liveOnlyMachine });

  expect(compact).toEqual({
    id: 'm-hc600',
    type: 'machine',
    name: 'M-HC600',
    position: { x: 0, y: 0, z: -3.1 },
    model: 'HC600',
    metricsSource: 'live',
    metricsAvailable: false,
  });
  expect(compact).not.toHaveProperty('status');
  expect(compact).not.toHaveProperty('machineStateNote');
  expect(compact).not.toHaveProperty('oee');
  expect(compact).not.toHaveProperty('temperature');
  expect(compact).not.toHaveProperty('todayCount');
  expect(compact).not.toHaveProperty('alarms');
});
