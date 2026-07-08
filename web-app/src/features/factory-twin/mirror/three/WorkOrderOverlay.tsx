// 3D 數位工廠視圖左下角的「當前派工單摘要浮層卡」。
// 資料源與右側 MachineDetail 相同：HC600-01 對映攝影機的
// latestOcrObservation.structuredFields（見 MachineDetail.tsx / machineCameras.ts）。
// 只做精簡摘要 + 誠實標示（低信心/未穩定→灰斜體＋待確認），不重複整張表格。
import { useState } from 'react';

import type { CameraOcrObservation } from '../../../../lib/types';
import {
  WORK_ORDER_QUANTITY_ROW_ORDER,
  isWorkOrderCellKnown,
  isWorkOrderCellPending,
  parseWorkOrderSheet,
  workOrderCellText,
  type WorkOrderLeaf,
  type WorkOrderSheet,
} from '../../../../lib/work-order';
import type { CameraEntity } from '../domain/entities';
import { useFactoryStore } from '../store/factoryStore';

function isOcrObservation(value: unknown): value is CameraOcrObservation {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CameraOcrObservation>;
  return typeof candidate.mode === 'string' && typeof candidate.summaryStatus === 'string';
}

function ocrObservationFor(camera: CameraEntity | undefined): CameraOcrObservation | null {
  const observation = camera?.attrs?.latestOcrObservation;
  return isOcrObservation(observation) ? observation : null;
}

function WorkOrderValue({
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
    <span
      className={known ? (pending ? 'wo-overlay-val wo-overlay-pending' : 'wo-overlay-val') : 'wo-overlay-unknown'}
    >
      {workOrderCellText(leaf)}
      {known && unit ? <span className="wo-overlay-unit">{unit}</span> : null}
      {pending ? <span className="wo-overlay-pending-tag">待確認</span> : null}
    </span>
  );
}

export function WorkOrderOverlay() {
  const platformCameras = useFactoryStore((s) => s.platformCameras);
  const [collapsed, setCollapsed] = useState(false);

  const ocrCamera = platformCameras.find((camera) => ocrObservationFor(camera));
  const observation = ocrObservationFor(ocrCamera);
  const sheet = observation ? parseWorkOrderSheet(observation.structuredFields) : null;
  // 找不到結構化派工單就不顯示這張卡。
  if (!sheet) return null;

  const f = sheet.fields;

  return (
    <div className={`wo-overlay${collapsed ? ' collapsed' : ''}`} aria-label="當前派工單摘要">
      <div className="wo-overlay-head">
        <span className="wo-overlay-title">當前派工單</span>
        <button
          type="button"
          className="wo-overlay-toggle"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? '展開派工單' : '收合派工單'}
          title={collapsed ? '展開派工單' : '收合派工單'}
        >
          {collapsed ? '＋' : '−'}
        </button>
      </div>
      {collapsed ? null : (
        <>
          <dl className="wo-overlay-list">
            <div className="wo-overlay-row">
              <dt>機台編號</dt>
              <dd>
                <WorkOrderValue leaf={f.machineNo} sheet={sheet} />
              </dd>
            </div>
            <div className="wo-overlay-row">
              <dt>模具編號</dt>
              <dd>
                <WorkOrderValue leaf={f.moldNo} sheet={sheet} />
              </dd>
            </div>
            {WORK_ORDER_QUANTITY_ROW_ORDER.map(({ key, label }) => {
              const row = sheet.quantities[key];
              return (
                <div className="wo-overlay-row" key={key}>
                  <dt>{row?.label ?? label}</dt>
                  <dd>
                    <span className="wo-overlay-lr">
                      <span className="wo-overlay-mark">L</span>
                      <WorkOrderValue leaf={row?.left} unit={sheet.unit} sheet={sheet} />
                    </span>
                    <span className="wo-overlay-lr">
                      <span className="wo-overlay-mark">R</span>
                      <WorkOrderValue leaf={row?.right} unit={sheet.unit} sheet={sheet} />
                    </span>
                  </dd>
                </div>
              );
            })}
            <div className="wo-overlay-row">
              <dt>材質</dt>
              <dd>
                <WorkOrderValue leaf={f.material} sheet={sheet} />
              </dd>
            </div>
            <div className="wo-overlay-row">
              <dt>顏色</dt>
              <dd>
                <WorkOrderValue leaf={f.color} sheet={sheet} />
              </dd>
            </div>
          </dl>
          <div className="wo-overlay-footnote">數字為自動辨識，以現場單據為準。</div>
        </>
      )}
    </div>
  );
}
