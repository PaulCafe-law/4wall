// Structured 派工單 (HC600 dispatch sheet) parsed by the GPU OCR worker and
// shipped verbatim inside CameraOcrObservation.structuredFields.workOrder.
// The worker marks every cell it cannot read confidently as "unknown"; the UI
// renders those as blank cells, mirroring the paper form.

export const WORK_ORDER_UNKNOWN = 'unknown'

// 低於此信心的辨識值視為「待確認」，UI 需灰色斜體標示。
export const WORK_ORDER_CONFIDENCE_THRESHOLD = 0.75

export interface WorkOrderLeaf {
  value: string | number
  confidence: number
  rawText: string
  label?: string
}

export interface WorkOrderQuantityRow {
  label: string
  left: WorkOrderLeaf
  right: WorkOrderLeaf
}

export interface WorkOrderSheet {
  template: string
  unit: string
  sourceLineCount: number
  // OCR worker 的多幀共識通過後才會標記 stabilized；缺欄位視為未穩定。
  stabilized: boolean
  fields: Record<string, WorkOrderLeaf>
  quantities: Record<string, WorkOrderQuantityRow>
}

export const WORK_ORDER_QUANTITY_ROW_ORDER: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'plannedWithHanger', label: '預計生產數（有掛）' },
  { key: 'plannedScheduledNoHanger', label: '預計生產數（有排程、無掛）' },
  { key: 'plannedNoHanger', label: '預計生產數（無掛）' },
  { key: 'total', label: '總計' },
]

function isLeaf(value: unknown): value is WorkOrderLeaf {
  if (typeof value !== 'object' || value === null) return false
  const leaf = value as Record<string, unknown>
  return (
    (typeof leaf.value === 'string' || typeof leaf.value === 'number') &&
    typeof leaf.confidence === 'number' &&
    typeof leaf.rawText === 'string'
  )
}

export function parseWorkOrderSheet(structuredFields: Record<string, unknown> | null | undefined): WorkOrderSheet | null {
  const candidate = structuredFields?.workOrder
  if (typeof candidate !== 'object' || candidate === null) return null
  const sheet = candidate as Record<string, unknown>
  if (typeof sheet.template !== 'string' || !sheet.template.startsWith('hc600_dispatch_sheet')) return null
  const fields = sheet.fields
  const quantities = sheet.quantities
  if (typeof fields !== 'object' || fields === null) return null
  if (typeof quantities !== 'object' || quantities === null) return null

  const parsedFields: Record<string, WorkOrderLeaf> = {}
  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    if (isLeaf(value)) parsedFields[key] = value
  }
  const parsedQuantities: Record<string, WorkOrderQuantityRow> = {}
  for (const [key, value] of Object.entries(quantities as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue
    const row = value as Record<string, unknown>
    if (typeof row.label === 'string' && isLeaf(row.left) && isLeaf(row.right)) {
      parsedQuantities[key] = { label: row.label, left: row.left, right: row.right }
    }
  }
  return {
    template: sheet.template,
    unit: typeof sheet.unit === 'string' ? sheet.unit : 'PCS',
    sourceLineCount: typeof sheet.sourceLineCount === 'number' ? sheet.sourceLineCount : 0,
    stabilized: sheet.stabilized === true,
    fields: parsedFields,
    quantities: parsedQuantities,
  }
}

export function workOrderCellText(leaf: WorkOrderLeaf | undefined): string {
  if (!leaf || leaf.value === WORK_ORDER_UNKNOWN) return '—'
  return String(leaf.value)
}

export function isWorkOrderCellKnown(leaf: WorkOrderLeaf | undefined): boolean {
  return Boolean(leaf) && leaf!.value !== WORK_ORDER_UNKNOWN
}

// 值已辨識但仍不可靠：整張單尚未通過多幀共識，或該欄信心低於門檻。
// UI 應以灰色斜體＋「待確認」小標呈現，提醒以現場單據為準。
export function isWorkOrderCellPending(
  leaf: WorkOrderLeaf | undefined,
  sheet: Pick<WorkOrderSheet, 'stabilized'>,
): boolean {
  if (!isWorkOrderCellKnown(leaf)) return false
  return !sheet.stabilized || leaf!.confidence < WORK_ORDER_CONFIDENCE_THRESHOLD
}
