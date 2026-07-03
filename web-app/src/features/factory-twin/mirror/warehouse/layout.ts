export type WarehouseSource = 'sim' | 'live';

export interface WarehousePoint {
  x: number;
  y: number;
}

export interface StorageSlot {
  id: string;
  row: number;
  col: number;
  level: number;
  cellId: string;
  point: WarehousePoint;
  distanceToDock: number;
  distanceToMainAisle: number;
}

export interface WarehouseLayout {
  source: WarehouseSource;
  columns: number;
  rows: number;
  levels: number;
  slots: StorageSlot[];
  cells: Array<{ id: string; row: number; col: number; point: WarehousePoint }>;
  agvStart: WarehousePoint;
  chargeStation: WarehousePoint;
  dock: WarehousePoint;
  workstations: WarehousePoint[];
  slotCount: number;
}

export interface WarehouseLayoutConfig {
  columns?: number;
  rows?: number;
  levels?: number;
  source?: WarehouseSource;
}

function manhattan(a: WarehousePoint, b: WarehousePoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function createWarehouseLayout(config: WarehouseLayoutConfig = {}): WarehouseLayout {
  const columns = config.columns ?? 14;
  const rows = config.rows ?? 10;
  const levels = config.levels ?? 13;
  const dock: WarehousePoint = { x: Math.floor(columns / 2), y: rows + 0.9 };
  const agvStart: WarehousePoint = { x: 0.5, y: rows + 0.75 };
  const chargeStation: WarehousePoint = { x: columns - 1.5, y: rows + 0.75 };
  const workstations: WarehousePoint[] = [
    { x: Math.floor(columns / 2) - 1.2, y: rows + 0.65 },
    { x: Math.floor(columns / 2) + 1.2, y: rows + 0.65 },
  ];
  const mainAisleCols = [Math.floor(columns / 2) - 1, Math.floor(columns / 2)];
  const cells: WarehouseLayout['cells'] = [];
  const slots: StorageSlot[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const cellId = `cell-${row}-${col}`;
      const point = { x: col + 0.5, y: row + 0.5 };
      cells.push({ id: cellId, row, col, point });
      const distanceToDock = manhattan(point, dock);
      const distanceToMainAisle = Math.min(...mainAisleCols.map((aisleCol) => Math.abs(col - aisleCol)));
      for (let level = 0; level < levels; level += 1) {
        slots.push({
          id: `S-${row.toString().padStart(2, '0')}-${col.toString().padStart(2, '0')}-${level.toString().padStart(2, '0')}`,
          row,
          col,
          level,
          cellId,
          point,
          distanceToDock,
          distanceToMainAisle,
        });
      }
    }
  }

  return {
    source: config.source ?? 'sim',
    columns,
    rows,
    levels,
    slots,
    cells,
    agvStart,
    chargeStation,
    dock,
    workstations,
    slotCount: slots.length,
  };
}
