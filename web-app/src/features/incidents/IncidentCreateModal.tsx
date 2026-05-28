import { useState } from 'react'

import { ActionButton, Field, Input, Modal, Select, TextArea } from '../../components/ui'
import type { IncidentPayload } from '../../lib/api'
import type { IncidentSeverity, IncidentSource } from '../../lib/types'
import { INCIDENT_SEVERITY_OPTIONS, INCIDENT_SOURCE_OPTIONS } from './incident-labels'

export interface IncidentOrganizationOption {
  organizationId: string
  label: string
  canWrite: boolean
}

export function IncidentCreateModal({
  open,
  onOpenChange,
  organizations,
  isSubmitting,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizations: IncidentOrganizationOption[]
  isSubmitting: boolean
  onSubmit: (payload: IncidentPayload) => void
}) {
  const writableOrganizations = organizations.filter((item) => item.canWrite)
  const [organizationId, setOrganizationId] = useState(writableOrganizations[0]?.organizationId ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<IncidentSeverity>('medium')
  const [source, setSource] = useState<IncidentSource>('manual')
  const [siteName, setSiteName] = useState('')
  const [areaName, setAreaName] = useState('')
  const [floor, setFloor] = useState('')
  const [equipmentName, setEquipmentName] = useState('')
  const [locationDescription, setLocationDescription] = useState('')
  const [assigneeName, setAssigneeName] = useState('')
  const [reporterName, setReporterName] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [evidenceText, setEvidenceText] = useState('')
  const [aiSummary, setAiSummary] = useState('')

  function submit() {
    const selectedOrganizationId = organizationId || writableOrganizations[0]?.organizationId
    if (!selectedOrganizationId || !title.trim()) return
    onSubmit({
      organizationId: selectedOrganizationId,
      title: title.trim(),
      description: description.trim(),
      severity,
      source,
      location: {
        siteName: siteName.trim() || undefined,
        areaName: areaName.trim() || undefined,
        floor: floor.trim() || undefined,
        equipmentName: equipmentName.trim() || undefined,
        description: locationDescription.trim() || undefined,
      },
      assigneeName: assigneeName.trim() || undefined,
      reporterName: reporterName.trim() || undefined,
      aiSummary: aiSummary.trim() || undefined,
      evidence: [
        ...(evidenceUrl.trim()
          ? [{ type: 'link' as const, url: evidenceUrl.trim() }]
          : []),
        ...(evidenceText.trim()
          ? [{ type: 'text' as const, text: evidenceText.trim() }]
          : []),
      ],
    })
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="建立異常事件"
      description="建立後會進入待確認狀態，緊急與高嚴重程度事件會觸發 LINE 推播流程。"
    >
      <div className="grid max-h-[72vh] gap-4 overflow-y-auto pr-1">
        <Field label="組織">
          <Select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
            {writableOrganizations.length === 0 ? <option value="">沒有可建立事件的組織</option> : null}
            {writableOrganizations.map((item) => (
              <option key={item.organizationId} value={item.organizationId}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="標題">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：A 區空壓機壓力表疑似異常" />
        </Field>
        <Field label="描述">
          <TextArea value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="嚴重程度">
            <Select value={severity} onChange={(event) => setSeverity(event.target.value as IncidentSeverity)}>
              {INCIDENT_SEVERITY_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="來源">
            <Select value={source} onChange={(event) => setSource(event.target.value as IncidentSource)}>
              {INCIDENT_SOURCE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="場域">
            <Input value={siteName} onChange={(event) => setSiteName(event.target.value)} placeholder="例如：工廠 A" />
          </Field>
          <Field label="區域">
            <Input value={areaName} onChange={(event) => setAreaName(event.target.value)} placeholder="例如：A 區" />
          </Field>
          <Field label="樓層">
            <Input value={floor} onChange={(event) => setFloor(event.target.value)} placeholder="例如：2F 東側" />
          </Field>
          <Field label="設備">
            <Input value={equipmentName} onChange={(event) => setEquipmentName(event.target.value)} placeholder="例如：空壓機" />
          </Field>
        </div>
        <Field label="位置描述">
          <Input value={locationDescription} onChange={(event) => setLocationDescription(event.target.value)} />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="負責人">
            <Input value={assigneeName} onChange={(event) => setAssigneeName(event.target.value)} />
          </Field>
          <Field label="回報人">
            <Input value={reporterName} onChange={(event) => setReporterName(event.target.value)} />
          </Field>
        </div>
        <Field label="證據連結">
          <Input value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://..." />
        </Field>
        <Field label="證據文字">
          <TextArea value={evidenceText} onChange={(event) => setEvidenceText(event.target.value)} />
        </Field>
        <Field label="AI 摘要">
          <TextArea value={aiSummary} onChange={(event) => setAiSummary(event.target.value)} />
        </Field>
        <div className="flex justify-end gap-3">
          <ActionButton variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </ActionButton>
          <ActionButton disabled={!title.trim() || !writableOrganizations.length || isSubmitting} onClick={submit}>
            {isSubmitting ? '建立中...' : '建立事件'}
          </ActionButton>
        </div>
      </div>
    </Modal>
  )
}
