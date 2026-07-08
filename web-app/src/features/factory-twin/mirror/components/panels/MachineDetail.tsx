import { useState } from 'react';

import type { CameraGaugeReading, CameraOcrObservation } from '../../../../../lib/types';
import {
  WORK_ORDER_QUANTITY_ROW_ORDER,
  isWorkOrderCellKnown,
  isWorkOrderCellPending,
  parseWorkOrderSheet,
  workOrderCellText,
  type WorkOrderLeaf,
  type WorkOrderSheet,
} from '../../../../../lib/work-order';
import type { CameraEntity, MachineEntity } from '../../domain/entities';
import { machineUsesLiveMetricsOnly, statusLabel } from '../../domain/entities';
import { camerasForMachine } from '../../domain/machineCameras';
import { useFactoryStore } from '../../store/factoryStore';
import { CameraFeed } from './CameraMonitor';

function isGaugeReading(value: unknown): value is CameraGaugeReading {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CameraGaugeReading>;
  return typeof candidate.gaugeId === 'string' && typeof candidate.label === 'string';
}

function isOcrObservation(value: unknown): value is CameraOcrObservation {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CameraOcrObservation>;
  return typeof candidate.mode === 'string' && typeof candidate.summaryStatus === 'string';
}

function WorkOrderCell({
  leaf,
  unit,
  sheet,
}: {
  leaf: WorkOrderLeaf | undefined;
  unit?: string;
  sheet: WorkOrderSheet;
}) {
  const known = isWorkOrderCellKnown(leaf);
  const pending = isWorkOrderCellPending(leaf, sheet);
  return (
    <span className={known ? (pending ? 'wo-num wo-pending' : 'wo-num') : 'wo-unknown'}>
      {workOrderCellText(leaf)}
      {known && unit ? <span className="wo-unit">{unit}</span> : null}
      {pending ? <span className="wo-pending-tag">待確認</span> : null}
    </span>
  );
}

function WorkOrderSheetBlock({ observation }: { observation: CameraOcrObservation }) {
  const sheet: WorkOrderSheet | null = parseWorkOrderSheet(observation.structuredFields);
  if (!sheet) {
    return observation.workOrderRawText ? (
      <div className="detail-note">派工單：{observation.workOrderRawText}</div>
    ) : null;
  }
  const f = sheet.fields;
  return (
    <>
      <table className="wo-sheet" aria-label="派工單">
        <tbody>
          <tr>
            <th>機台編號</th>
            <td><WorkOrderCell leaf={f.machineNo} sheet={sheet} /></td>
            <th>模具編號</th>
            <td colSpan={2}><WorkOrderCell leaf={f.moldNo} sheet={sheet} /></td>
          </tr>
          <tr>
            <th>生產日期</th>
            <td><WorkOrderCell leaf={f.productionDate} sheet={sheet} /></td>
            <th>模具穴數</th>
            <td colSpan={2}><WorkOrderCell leaf={f.moldCavity} sheet={sheet} /></td>
          </tr>
          {WORK_ORDER_QUANTITY_ROW_ORDER.map(({ key, label }) => {
            const row = sheet.quantities[key];
            return (
              <tr key={key}>
                <th>{row?.label ?? label}</th>
                <td className="wo-mark">L</td>
                <td><WorkOrderCell leaf={row?.left} unit={sheet.unit} sheet={sheet} /></td>
                <td className="wo-mark">R</td>
                <td><WorkOrderCell leaf={row?.right} unit={sheet.unit} sheet={sheet} /></td>
              </tr>
            );
          })}
          <tr>
            <th>材質</th>
            <td><WorkOrderCell leaf={f.material} sheet={sheet} /></td>
            <th>顏色</th>
            <td colSpan={2}><WorkOrderCell leaf={f.color} sheet={sheet} /></td>
          </tr>
          <tr>
            <th>備註</th>
            <td colSpan={4}><WorkOrderCell leaf={f.remark} sheet={sheet} /></td>
          </tr>
        </tbody>
      </table>
      <div className="wo-footnote">數字為自動辨識，以現場單據為準。</div>
    </>
  );
}

function gaugeReadingsFor(camera: CameraEntity | undefined): CameraGaugeReading[] {
  const readings = camera?.attrs?.latestGaugeReadings;
  return Array.isArray(readings) ? readings.filter(isGaugeReading) : [];
}

function ocrObservationFor(camera: CameraEntity | undefined): CameraOcrObservation | null {
  const observation = camera?.attrs?.latestOcrObservation;
  return isOcrObservation(observation) ? observation : null;
}

function formatGaugeValue(reading: CameraGaugeReading): string {
  if (reading.value === null) return 'N/A';
  return `${reading.value.toFixed(1)} ${reading.unit}`.trim();
}

function formatTime(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return value;
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(timestamp);
}

function confidenceLabel(value: number): string {
  return `${Math.round(Math.max(0, Math.min(value, 1)) * 100)}%`;
}

function ocrModeLabel(mode: CameraOcrObservation['mode']): string {
  if (mode === 'temperature_monitor') return '溫度監控頁';
  if (mode === 'machine_monitor') return '機器監視頁';
  return '未知畫面';
}

function summaryStatusLabel(status: CameraOcrObservation['summaryStatus']): string {
  if (status === 'ok') return '摘要完成';
  if (status === 'auth_required') return '需要登入 GPT';
  if (status === 'failed') return '摘要失敗';
  return '尚未摘要';
}

function summaryText(observation: CameraOcrObservation): string | null {
  const value = observation.gptSummary.summary;
  return typeof value === 'string' && value.trim() ? value : null;
}

export function MachineDetail({ entity }: { entity: MachineEntity }) {
  const platformCameras = useFactoryStore((s) => s.platformCameras);
  const cameras =
    entity.id === 'm-hc600' && platformCameras.length > 0
      ? platformCameras
      : camerasForMachine(entity.id);
  const [selectedCameraId, setSelectedCameraId] = useState(() => cameras[0]?.id ?? '');
  const activeCameraId = cameras.some((camera) => camera.id === selectedCameraId)
    ? selectedCameraId
    : (cameras[0]?.id ?? '');
  const selectedCamera = cameras.find((camera) => camera.id === activeCameraId);
  const gaugeCamera = cameras.find((camera) => gaugeReadingsFor(camera).length > 0);
  const gaugeReadings = gaugeReadingsFor(gaugeCamera);
  const ocrCamera = cameras.find((camera) => ocrObservationFor(camera));
  const ocrObservation = ocrObservationFor(ocrCamera);
  const liveMetricsOnly = machineUsesLiveMetricsOnly(entity);

  return (
    <div className="detail">
      <div className="panel-title">機台資訊</div>
      <h3 className="detail-name">{entity.name}</h3>
      <span className={`badge ${liveMetricsOnly ? 'live-only' : entity.status}`}>
        {liveMetricsOnly ? '真實資料' : statusLabel(entity.status)}
      </span>

      <dl className="kv">
        <div><dt>型號</dt><dd>{entity.model}</dd></div>
        {liveMetricsOnly ? (
          <>
            <div><dt>機台狀態</dt><dd>{statusLabel(entity.status)}</dd></div>
            <div><dt>資料來源</dt><dd>真實資料</dd></div>
          </>
        ) : (
          <>
            <div><dt>OEE</dt><dd>{entity.oee}%</dd></div>
            <div><dt>溫度</dt><dd>{entity.temperature}C</dd></div>
            <div><dt>週期</dt><dd>{entity.cycleTimeSec}s</dd></div>
            <div><dt>今日產量</dt><dd>{entity.todayCount}</dd></div>
            <div><dt>警報</dt><dd>{entity.alarms}</dd></div>
            <div><dt>資料來源</dt><dd>{entity.source === 'sim' ? '模擬' : '即時'}</dd></div>
          </>
        )}
      </dl>

      <div className="machine-gauges" aria-label={`${entity.name} live gauge readings`}>
        <div className="panel-title">實際讀表</div>
        {gaugeReadings.length > 0 ? (
          <>
            <div className="gauge-source">來源：{gaugeCamera?.name ?? 'Pi gauge reader'}</div>
            <div className="gauge-list">
              {gaugeReadings.map((reading) => (
                <div className="gauge-card" key={reading.gaugeId}>
                  <div>
                    <div className="gauge-name">{reading.label || reading.gaugeId}</div>
                    <div className="gauge-meta">
                      {reading.status} / 信心 {confidenceLabel(reading.confidence)}
                    </div>
                  </div>
                  <div className="gauge-reading">
                    <strong>{formatGaugeValue(reading)}</strong>
                    <span>{formatTime(reading.capturedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="detail-note">尚無實際讀表資料。請確認 Pi gauge reader 或 GPU OCR worker 是否已上傳。</div>
        )}
      </div>

      <div className="machine-gauges" aria-label={`${entity.name} HMI OCR`}>
        <div className="panel-title">HMI OCR / 派工單</div>
        {ocrObservation ? (
          <>
            <div className="gauge-source">來源：{ocrCamera?.name ?? 'GPU HMI OCR worker'}</div>
            <div className="gauge-list">
              <div className="gauge-card">
                <div>
                  <div className="gauge-name">{ocrModeLabel(ocrObservation.mode)}</div>
                  <div className="gauge-meta">
                    畫面信心 {confidenceLabel(ocrObservation.modeConfidence)} / {summaryStatusLabel(ocrObservation.summaryStatus)}
                  </div>
                </div>
                <div className="gauge-reading">
                  <strong>{ocrObservation.rawOcrLines.length} 行</strong>
                  <span>{formatTime(ocrObservation.capturedAt)}</span>
                </div>
              </div>
            </div>
            {summaryText(ocrObservation) ? (
              <div className="detail-note">{summaryText(ocrObservation)}</div>
            ) : null}
            <WorkOrderSheetBlock observation={ocrObservation} />
            {ocrObservation.summaryError ? (
              <div className="detail-note">GPT 狀態：{ocrObservation.summaryError}</div>
            ) : null}
          </>
        ) : (
          <div className="detail-note">尚無 HMI OCR。nckusoc worker 送回 observation 後會顯示在這裡。</div>
        )}
      </div>

      {cameras.length > 0 ? (
        <div className="machine-cameras">
          <div className="panel-title">監視器選單</div>
          <div className="cam-switcher" role="tablist" aria-label={`${entity.name} cameras`}>
            {cameras.map((camera) => (
              <button
                key={camera.id}
                className={`cam-tab ${camera.id === activeCameraId ? 'active' : ''}`}
                onClick={() => setSelectedCameraId(camera.id)}
                type="button"
                role="tab"
                aria-selected={camera.id === activeCameraId}
              >
                {camera.name}
              </button>
            ))}
          </div>
          {selectedCamera ? <CameraFeed entity={selectedCamera} /> : null}
        </div>
      ) : null}
    </div>
  );
}
