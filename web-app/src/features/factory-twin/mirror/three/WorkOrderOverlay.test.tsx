import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach } from 'vitest';

import type { CameraOcrObservation } from '../../../../lib/types';
import { useFactoryStore } from '../store/factoryStore';
import { WorkOrderOverlay } from './WorkOrderOverlay';

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
    rawOcrLines: [{ text: 'HC600 FLJ2R02', confidence: 0.86, box: null, region: 'work_order' }],
    structuredFields: { screen: { kind: 'machine_monitor' } },
    workOrderRawText: 'HC600 FLJ2R02',
    gptSummary: { summary: 'HC600 目前為手動模式，派工單為 FLJ2R02。' },
    summaryStatus: 'ok',
    summaryError: null,
  };
}

function workOrderStructuredFields(stabilized = true) {
  return {
    screen: { kind: 'machine_monitor' },
    workOrder: {
      template: 'hc600_dispatch_sheet_v1',
      unit: 'PCS',
      sourceLineCount: 56,
      stabilized,
      fields: {
        machineNo: { label: '機台編號', value: 'HC600', confidence: 0.82, rawText: 'HC600' },
        moldNo: { label: '模具編號', value: 'GM096LC', confidence: 0.62, rawText: 'GM096LC' },
        material: { label: '材質', value: 'PC', confidence: 0.85, rawText: 'PC' },
        color: { label: '顏色', value: '透明', confidence: 0.99, rawText: '明' },
      },
      quantities: {
        plannedNoHanger: {
          label: '預計生產數（無掛）',
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
  };
}

function seedCamera(structuredFields: Record<string, unknown> | null) {
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
          latestOcrObservation: structuredFields
            ? { ...ocrObservation('factory-1'), structuredFields }
            : ocrObservation('factory-1'),
        },
      },
    ],
  });
}

beforeEach(() => {
  useFactoryStore.setState({ platformCameras: [] });
});

it('renders nothing when no platform camera carries a structured work order', () => {
  const { container } = render(<WorkOrderOverlay />);
  expect(container).toBeEmptyDOMElement();
});

it('renders nothing when the OCR observation has no structured 派工單', () => {
  seedCamera(null);
  const { container } = render(<WorkOrderOverlay />);
  expect(container).toBeEmptyDOMElement();
});

it('renders the work order summary overlay with recognized values and the footnote', () => {
  seedCamera(workOrderStructuredFields(true));

  render(<WorkOrderOverlay />);

  const card = screen.getByLabelText('當前派工單摘要');
  const scoped = within(card);
  expect(scoped.getByText('當前派工單')).toBeInTheDocument();
  expect(scoped.getByText('HC600')).toBeInTheDocument();
  expect(scoped.getByText('透明')).toBeInTheDocument();
  expect(scoped.getByText('PC')).toBeInTheDocument();
  expect(scoped.getAllByText('210')).toHaveLength(2);
  expect(scoped.getByText('總計')).toBeInTheDocument();
  expect(scoped.getByText('數字為自動辨識，以現場單據為準。')).toBeInTheDocument();
});

it('marks low-confidence values as 待確認 with a pending class and leaves confident values plain', () => {
  seedCamera(workOrderStructuredFields(true));

  render(<WorkOrderOverlay />);

  const card = screen.getByLabelText('當前派工單摘要');
  const scoped = within(card);
  // moldNo 信心 0.62 < 0.75 → 灰斜體＋待確認；HC600 信心 0.82 不受影響。
  expect(scoped.getAllByText('待確認')).toHaveLength(1);
  expect(scoped.getByText('GM096LC').closest('span')).toHaveClass('wo-overlay-pending');
  expect(scoped.getByText('HC600').closest('span')).not.toHaveClass('wo-overlay-pending');
});

it('marks every recognized value 待確認 when the sheet has not stabilized', () => {
  seedCamera(workOrderStructuredFields(false));

  render(<WorkOrderOverlay />);

  const scoped = within(screen.getByLabelText('當前派工單摘要'));
  // 高信心也一樣待確認：整張單尚未通過多幀共識。
  expect(scoped.getByText('HC600').closest('span')).toHaveClass('wo-overlay-pending');
  expect(scoped.getAllByText('待確認').length).toBeGreaterThan(1);
});

it('collapses and re-expands the card without unmounting it', async () => {
  const user = userEvent.setup();
  seedCamera(workOrderStructuredFields(true));

  render(<WorkOrderOverlay />);

  expect(screen.getByText('數字為自動辨識，以現場單據為準。')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '收合派工單' }));
  expect(screen.queryByText('數字為自動辨識，以現場單據為準。')).not.toBeInTheDocument();
  // 標題列仍在，可再次展開。
  expect(screen.getByText('當前派工單')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '展開派工單' }));
  expect(screen.getByText('數字為自動辨識，以現場單據為準。')).toBeInTheDocument();
});
