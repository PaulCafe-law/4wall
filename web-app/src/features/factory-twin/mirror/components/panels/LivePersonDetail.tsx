import type { PersonEntity } from '../../domain/entities';

function textAttr(attrs: Record<string, unknown> | undefined, key: string): string | null {
  const value = attrs?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberAttr(attrs: Record<string, unknown> | undefined, key: string): number | null {
  const value = attrs?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatTime(value: string | null): string {
  if (!value) return '未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-TW', { hour12: false });
}

export function LivePersonDetail({ entity }: { entity: PersonEntity }) {
  const attrs = entity.attrs;
  const confidence = numberAttr(attrs, 'confidence');
  const cameraLabel = textAttr(attrs, 'cameraLabel') ?? textAttr(attrs, 'platformCameraName') ?? '未知攝影機';
  const capturedAt = textAttr(attrs, 'capturedAt');

  return (
    <div className="detail">
      <div className="panel-title">現場匿名人員</div>
      <div className="detail-grid">
        <div>
          <span>狀態</span>
          <strong>現場偵測</strong>
        </div>
        <div>
          <span>攝影機</span>
          <strong>{cameraLabel}</strong>
        </div>
        <div>
          <span>信心分數</span>
          <strong>{confidence === null ? '未知' : `${Math.round(confidence * 100)}%`}</strong>
        </div>
        <div>
          <span>擷取時間</span>
          <strong>{formatTime(capturedAt)}</strong>
        </div>
        <div>
          <span>Frame</span>
          <strong>{textAttr(attrs, 'frameId') ?? '未提供'}</strong>
        </div>
        <div>
          <span>校正</span>
          <strong>{textAttr(attrs, 'calibrationId') ?? '未套用'}</strong>
        </div>
        <div>
          <span>Detector</span>
          <strong>{textAttr(attrs, 'detectorName') ?? '未知'}</strong>
        </div>
        <div>
          <span>世界座標</span>
          <strong>
            x {entity.position.x.toFixed(2)} / z {entity.position.z.toFixed(2)}
          </strong>
        </div>
      </div>
      {attrs?.approximate === true ? (
        <div className="detail-note">攝影機偵測到現場有人，顯示於此機台前的作業位置。</div>
      ) : null}
      <div className="detail-note">此為匿名人員在場投影，只讀顯示，不提供 LINE 聊天或派工控制。</div>
    </div>
  );
}
