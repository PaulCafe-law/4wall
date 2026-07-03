import { useState } from 'react';

import type { CameraGaugeReading } from '../../../../../lib/types';
import { assign_task, highlight_entity } from '../../actions/actions';
import { OVERLAY } from '../../domain/colors';
import type { CameraEntity, MachineEntity } from '../../domain/entities';
import { statusLabel } from '../../domain/entities';
import { camerasForMachine } from '../../domain/machineCameras';
import { useFactoryStore } from '../../store/factoryStore';
import { CameraFeed } from './CameraMonitor';

function isGaugeReading(value: unknown): value is CameraGaugeReading {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CameraGaugeReading>;
  return typeof candidate.gaugeId === 'string' && typeof candidate.label === 'string';
}

function gaugeReadingsFor(camera: CameraEntity | undefined): CameraGaugeReading[] {
  const readings = camera?.attrs?.latestGaugeReadings;
  return Array.isArray(readings) ? readings.filter(isGaugeReading) : [];
}

function formatGaugeValue(reading: CameraGaugeReading): string {
  if (reading.value === null) return 'N/A';
  return `${reading.value.toFixed(1)} ${reading.unit}`.trim();
}

function formatGaugeTime(value: string): string {
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

  return (
    <div className="detail">
      <div className="panel-title">機台資訊</div>
      <h3 className="detail-name">{entity.name}</h3>
      <span className={`badge ${entity.status}`}>{statusLabel(entity.status)}</span>

      <dl className="kv">
        <div><dt>型號</dt><dd>{entity.model}</dd></div>
        <div><dt>OEE</dt><dd>{entity.oee}%</dd></div>
        <div><dt>溫度</dt><dd>{entity.temperature}C</dd></div>
        <div><dt>週期</dt><dd>{entity.cycleTimeSec}s</dd></div>
        <div><dt>今日產量</dt><dd>{entity.todayCount}</dd></div>
        <div><dt>警報</dt><dd>{entity.alarms}</dd></div>
        <div><dt>資料來源</dt><dd>{entity.source === 'sim' ? '模擬' : '即時'}</dd></div>
      </dl>

      <div className="machine-gauges" aria-label={`${entity.name} 實際讀表`}>
        <div className="panel-title">實際讀表</div>
        {gaugeReadings.length > 0 ? (
          <>
            <div className="gauge-source">
              來源：{gaugeCamera?.name ?? 'Pi gauge reader'}
            </div>
            <div className="gauge-list">
              {gaugeReadings.map((reading) => (
                <div className="gauge-card" key={reading.gaugeId}>
                  <div>
                    <div className="gauge-name">{reading.label || reading.gaugeId}</div>
                    <div className="gauge-meta">
                      {reading.status} · 信心 {confidenceLabel(reading.confidence)}
                    </div>
                  </div>
                  <div className="gauge-reading">
                    <strong>{formatGaugeValue(reading)}</strong>
                    <span>{formatGaugeTime(reading.capturedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="detail-note">尚未收到現場儀表讀值，讀表裝置連線後會即時顯示在這裡。</div>
        )}
      </div>

      <div className="detail-actions">
        <button className="btn" onClick={() => highlight_entity({ ids: [entity.id], color: OVERLAY.alarm })}>
          標記警報
        </button>
        <button className="btn" onClick={() => assign_task({ worker: 'p-zhiqiang', target: entity.id, task: '檢查 HC600-01' })}>
          派工檢查
        </button>
      </div>

      {cameras.length > 0 ? (
        <div className="machine-cameras">
          <div className="panel-title">監視器選單</div>
          <div className="cam-switcher" role="tablist" aria-label={`${entity.name} 監視器`}>
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
