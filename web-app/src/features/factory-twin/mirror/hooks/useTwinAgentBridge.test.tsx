import '@testing-library/jest-dom/vitest';

import { act, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../../test/utils';
import type { MachineEntity, PersonEntity } from '../domain/entities';
import { useFactoryStore } from '../store/factoryStore';
import {
  compactEntities,
  TWIN_AGENT_SESSION_ID,
  useTwinAgentBridge,
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

function Harness({ liveDataStatus }: { liveDataStatus?: TwinAgentLiveDataStatus }) {
  useTwinAgentBridge(liveDataStatus);
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

beforeEach(() => {
  vi.clearAllMocks();
  useFactoryStore.setState(useFactoryStore.getInitialState(), true);
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

it('never re-executes an already-processed seq and keeps the cursor across mounts', async () => {
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
    expect(toolsMock.executeToolCall).toHaveBeenCalledTimes(1);
  });
  expect(apiMock.getTwinAgentUpdates).toHaveBeenCalledWith('test-token', TWIN_AGENT_SESSION_ID, 2);
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
