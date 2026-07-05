// Structured 派工單 (HC600 dispatch sheet) parsed by the GPU OCR worker and
// shipped verbatim inside CameraOcrObservation.structuredFields.workOrder.
// The worker marks every cell it cannot read confidently as "unknown"; the UI
// renders those as blank cells, mirroring the paper form.

export const WORK_ORDER_UNKNOWN = 'unknown'

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
  fields: Record<string, WorkOrderLeaf>
  quantities: Record<string, WorkOrderQuantityRow>
}

export const WORK_ORDER_QUANTITY_ROW_ORDER: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'plannedShift', label: '預計生產數（本班）' },
  { key: 'plannedCumulative', label: '預計生產數（累計）' },
  { key: 'producedCumulative', label: '累計生產數' },
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
