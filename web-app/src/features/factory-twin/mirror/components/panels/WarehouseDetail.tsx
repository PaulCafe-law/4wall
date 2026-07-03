import type { ZoneEntity } from '../../domain/entities';

export function WarehouseDetail({ entity }: { entity: ZoneEntity }) {
  const desc = entity.attrs?.desc as string | undefined;
  const hasCapacity = entity.capacity > 0;
  const pct = hasCapacity ? Math.round((entity.used / entity.capacity) * 100) : 0;
  const hasInventory = entity.inventory.length > 0;

  return (
    <div className="detail">
      <div className="panel-title">{hasInventory ? '倉儲即時庫存' : '工廠區域'}</div>
      <h3 className="detail-name">{entity.name}</h3>
      {desc && <div className="cam-meta">{desc}</div>}

      {hasCapacity && (
        <div className="usage">
          <div className="usage-bar">
            <span style={{ width: `${pct}%` }} />
          </div>
          <span className="usage-text">
            {pct}%（{entity.used}/{entity.capacity}）・SKU {entity.skuCount}
          </span>
        </div>
      )}

      {hasInventory && (
        <table className="inv">
          <thead>
            <tr>
              <th>料號</th>
              <th>品名</th>
              <th>數量</th>
              <th>週轉</th>
            </tr>
          </thead>
          <tbody>
            {entity.inventory.map((i) => (
              <tr key={i.sku}>
                <td>{i.sku}</td>
                <td>{i.name}</td>
                <td>{i.qty}</td>
                <td className={`turn ${i.turnover}`}>{i.turnover}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="detail-note">P2：倉儲數位分身（揀貨效率 / AGV 路徑 / 熱力圖）獨立排程，不影響主 demo。</div>
    </div>
  );
}
