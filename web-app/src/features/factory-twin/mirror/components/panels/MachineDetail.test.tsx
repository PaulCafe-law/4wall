import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';

import type { CameraGaugeReading, CameraOcrObservation } from '../../../../../lib/types';
import type { CameraEntity, MachineEntity } from '../../domain/entities';
import { useFactoryStore } from '../../store/factoryStore';
import { MachineDetail } from './MachineDetail';

vi.mock('./CameraMonitor', () => ({
  CameraFeed: ({ entity }: { entity: CameraEntity }) => (
    <div data-testid="camera-feed">{entity.name}</div>
  ),
}));

function gaugeReading(cameraId: string, gaugeId: string): CameraGaugeReading {
  return {
    readingId: `${cameraId}-${gaugeId}-reading`,
    cameraId,
    frameId: `${cameraId}-frame`,
    gaugeId,
    label: gaugeId,
    value: 0,
    unit: 'A',
    confidence: 0.99,
    rawPosition: 0,
    status: 'ok',
    source: 'live',
    capturedAt: '2026-07-02T23:28:55+08:00',
    receivedAt: '2026-07-02T23:28:57+08:00',
    metadata: {},
  };
}

function ocrObservation(cameraId: string): CameraOcrObservation {
  return {
    observationId: `${cameraId}-ocr-observation`,
    cameraId,
    frameId: `${cameraId}-frame`,
    mode: 'machine_monitor',
    modeConfidence: 0.88,
    source: 'live',
    capturedAt: '2026-07-04T10:00:00+08:00',
    receivedAt: '2026-07-04T10:00:02+08:00',
    rawOcrLines: [
      { text: '機器監視', confidence: 0.91, box: null, region: 'hmi' },
      { text: 'HC600 FLJ2R02', confidence: 0.86, box: null, region: 'work_order' },
    ],
    structuredFields: { screen: { kind: 'machine_monitor' } },
    workOrderRawText: 'HC600 FLJ2R02',
    gptSummary: { summary: 'HC600 目前為手動模式，派工單為 FLJ2R02。' },
    summaryStatus: 'ok',
    summaryError: null,
  };
}

const hc600: MachineEntity = {
  id: 'm-hc600',
  type: 'machine',
  name: 'HC600-01',
  position: { x: 0, y: 0, z: 0 },
  status: 'running',
  source: 'sim',
  model: 'HC600',
  oee: 86,
  temperature: 78,
  cycleTimeSec: 32,
  todayCount: 412,
  alarms: 1,
};

beforeEach(() => {
  useFactoryStore.setState({ platformCameras: [] });
});

it('shows live gauge readings and HMI OCR for HC600-01 when platform camera data contains them', () => {
  useFactoryStore.setState({
    platformCameras: [
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
            gaugeReading('factory-1', 'PRESS AM METER'),
            gaugeReading('factory-1', 'FLOW AM METER'),
          ],
          latestOcrObservation: ocrObservation('factory-1'),
        },
      },
    ],
  });

  render(<MachineDetail entity={hc600} />);

  expect(screen.getByText('實際讀表')).toBeInTheDocument();
  expect(screen.getByText('PRESS AM METER')).toBeInTheDocument();
  expect(screen.getByText('FLOW AM METER')).toBeInTheDocument();
  expect(screen.getAllByText('0.0 A')).toHaveLength(2);
  expect(screen.getByText('HMI OCR / 派工單')).toBeInTheDocument();
  expect(screen.getByText('機器監視頁')).toBeInTheDocument();
  expect(screen.getByText('HC600 目前為手動模式，派工單為 FLJ2R02。')).toBeInTheDocument();
});

it('renders the structured 派工單 sheet with OCR values and blank unknown cells', () => {
  const unknown = { value: 'unknown', confidence: 0, rawText: '' };
  const observation = {
    ...ocrObservation('factory-1'),
    structuredFields: {
      screen: { kind: 'machine_monitor' },
      workOrder: {
        template: 'hc600_dispatch_sheet_v1',
        unit: 'PCS',
        sourceLineCount: 56,
        fields: {
          machineNo: { label: '機台編號', value: 'HC600', confidence: 0.82, rawText: 'HC600' },
          moldNo: { label: '模具編號', value: 'GM096LC', confidence: 0.78, rawText: 'GM096LC' },
          productionDate: { label: '生產日期', value: '115年', confidence: 0.9, rawText: '115' },
          moldCavity: { label: '模具穴數', value: '1模2穴', confidence: 0.77, rawText: '1 2穴' },
          material: { label: '材質', value: 'PC', confidence: 0.85, rawText: 'PC' },
          color: { label: '顏色', value: '透明', confidence: 0.99, rawText: '明' },
          packaging: { label: '包裝方式', ...unknown },
          shipDate: { label: '出貨日期', ...unknown },
          remark: { label: '備註', ...unknown },
        },
        quantities: {
          plannedShift: { label: '預計生產數（本班）', left: unknown, right: unknown },
          plannedCumulative: { label: '預計生產數（累計）', left: unknown, right: unknown },
          producedCumulative: {
            label: '累計生產數',
            left: { value: 10, confidence: 1, rawText: '10' },
            right: { value: 10, confidence: 0.95, rawText: '10' },
          },
          total: {
            label: '總計',
            left: { value: 210, confidence: 0.95, rawText: '210' },
            right: { value: 210, confidence: 0.97, rawText: '210' },
          },
        },
      },
    },
  };
  useFactoryStore.setState({
    platformCameras: [
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
        attrs: { latestOcrObservation: observation },
      },
    ],
  });

  render(<MachineDetail entity={hc600} />);

  const sheet = within(screen.getByRole('table', { name: '派工單' }));
  expect(sheet.getByText('HC600')).toBeInTheDocument();
  expect(sheet.getByText('GM096LC')).toBeInTheDocument();
  expect(sheet.getByText('1模2穴')).toBeInTheDocument();
  expect(sheet.getByText('透明')).toBeInTheDocument();
  expect(sheet.getAllByText('210')).toHaveLength(2);
  expect(sheet.getByText('總計')).toBeInTheDocument();
  expect(sheet.getAllByText('—').length).toBeGreaterThanOrEqual(5);
});
