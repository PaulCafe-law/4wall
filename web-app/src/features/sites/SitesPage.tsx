import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'

import {
  ActionButton,
  DataList,
  EmptyState,
  Field,
  Input,
  Metric,
  Modal,
  Panel,
  Select,
  ShellSection,
  TextArea,
  formatDate,
} from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import { useOrganizationChoices } from '../../lib/organization-choices'
import { formatApiError, formatSearchMode } from '../../lib/presentation'

const siteSchema = z.object({
  organizationId: z.string().min(1, '請選擇組織。'),
  name: z.string().min(1, '請輸入場域名稱。'),
  address: z.string().min(1, '請輸入場域地址。'),
  externalRef: z.string().optional(),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  notes: z.string().default(''),
})

type SiteFormInput = z.input<typeof siteSchema>
type SiteFormValues = z.output<typeof siteSchema>

export function SitesPage() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const { siteId } = useParams()
  const [search, setSearch] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const deferredSearch = useDeferredValue(search)
  const { choices } = useOrganizationChoices('write')

  const sitesQuery = useAuthedQuery({
    queryKey: ['sites'],
    queryFn: api.listSites,
    staleTime: 15_000,
  })

  const createSite = useAuthedMutation({
    mutationKey: ['sites', 'create'],
    mutationFn: ({ token, payload }: { token: string; payload: SiteFormValues }) =>
      api.createSite(token, {
        organizationId: payload.organizationId,
        name: payload.name,
        externalRef: payload.externalRef,
        address: payload.address,
        location: { lat: payload.lat, lng: payload.lng },
        notes: payload.notes,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sites'] })
      setIsOpen(false)
    },
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setError,
  } = useForm<SiteFormInput, undefined, SiteFormValues>({
    resolver: zodResolver(siteSchema),
    defaultValues: {
      organizationId: choices[0]?.organizationId ?? '',
      name: '',
      address: '',
      externalRef: '',
      lat: 25.03391,
      lng: 121.56452,
      notes: '',
    },
  })

  const allSites = sitesQuery.data ?? []
  const filteredSites = allSites.filter((site) => {
    const haystack = `${site.name} ${site.address} ${site.externalRef ?? ''}`.toLowerCase()
    return haystack.includes(deferredSearch.toLowerCase())
  })
  const selectedSite = filteredSites.find((site) => site.siteId === siteId) ?? filteredSites[0] ?? null

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createSite.mutateAsync(values)
      reset()
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setError('root', { message: formatApiError(detail, '無法建立場域，請稍後再試。') })
    }
  })

  const rail = selectedSite ? (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">場域摘要</p>
      <h2 className="mt-3 font-display text-2xl font-semibold text-chrome-950">{selectedSite.name}</h2>
      <div className="mt-4">
        <DataList
          rows={[
            { label: '地址', value: selectedSite.address },
            { label: '外部參考', value: selectedSite.externalRef ?? '未設定' },
            {
              label: '座標',
              value: `${selectedSite.location.lat.toFixed(5)}, ${selectedSite.location.lng.toFixed(5)}`,
            },
            { label: '更新日期', value: formatDate(selectedSite.updatedAt) },
            { label: '備註', value: selectedSite.notes || '目前沒有備註' },
          ]}
        />
      </div>
    </Panel>
  ) : (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">尚未選擇場域</p>
      <p className="mt-3 text-sm text-chrome-700">
        從左側選取場域，即可查看地址、座標與附註，也可以直接建立新的場域作為控制平面起點。
      </p>
    </Panel>
  )

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="客戶工作區"
        title="場域"
        subtitle="管理所有任務與控制平面的場域背景資料，後續的航線、排程與巡檢紀錄都會掛接在場域之下。"
        action={
          choices.length > 0 ? (
            <Modal
              open={isOpen}
              onOpenChange={setIsOpen}
              title="建立場域"
              description="建立新的場域後，就能作為任務與控制平面的基礎資料。"
              trigger={<ActionButton>新增場域</ActionButton>}
            >
              <form className="space-y-4" onSubmit={onSubmit}>
                <Field label="組織" error={errors.organizationId?.message}>
                  <Select {...register('organizationId')}>
                    {choices.map((choice) => (
                      <option key={choice.organizationId} value={choice.organizationId}>
                        {choice.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="場域名稱" error={errors.name?.message}>
                  <Input {...register('name')} />
                </Field>
                <Field label="地址" error={errors.address?.message}>
                  <Input {...register('address')} />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="緯度" error={errors.lat?.message}>
                    <Input type="number" step="0.00001" {...register('lat')} />
                  </Field>
                  <Field label="經度" error={errors.lng?.message}>
                    <Input type="number" step="0.00001" {...register('lng')} />
                  </Field>
                </div>
                <Field label="外部參考" error={errors.externalRef?.message}>
                  <Input {...register('externalRef')} />
                </Field>
                <Field label="備註" error={errors.notes?.message}>
                  <TextArea {...register('notes')} />
                </Field>
                {errors.root?.message ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errors.root.message}
                  </div>
                ) : null}
                <div className="flex justify-end">
                  <ActionButton disabled={createSite.isPending} type="submit">
                    {createSite.isPending ? '建立中…' : '建立場域'}
                  </ActionButton>
                </div>
              </form>
            </Modal>
          ) : null
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="可見場域" value={filteredSites.length} hint="目前篩選條件下可查看的場域數量。" />
        <Metric label="可寫組織" value={choices.length} hint="至少要有一個可寫組織，才能新增場域。" />
        <Metric label="搜尋模式" value={formatSearchMode(Boolean(deferredSearch))} hint="可用場域名稱或地址快速篩選。" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Panel>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">搜尋場域</p>
                <p className="mt-1 text-sm text-chrome-700">可依場域名稱、地址或外部參考搜尋。</p>
              </div>
              <div className="w-full md:w-80">
                <Input placeholder="搜尋場域" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
            </div>
          </Panel>

          {sitesQuery.isLoading ? (
            <Panel>
              <p className="text-sm text-chrome-700">正在載入場域資料…</p>
            </Panel>
          ) : null}

          {!sitesQuery.isLoading && filteredSites.length === 0 ? (
            <EmptyState
              title={allSites.length === 0 ? '目前還沒有場域' : '找不到符合條件的場域'}
              body={
                allSites.length === 0
                  ? '先建立第一個場域，之後才能掛接任務、控制平面與巡檢報表。'
                  : '請調整搜尋條件，或建立新的場域資料。'
              }
            />
          ) : null}

          <div className="grid gap-4">
            {filteredSites.map((site) => (
              <Link key={site.siteId} to={`/sites/${site.siteId}`}>
                <Panel
                  className={
                    selectedSite?.siteId === site.siteId
                      ? 'border-ember-300 bg-white'
                      : 'transition hover:border-chrome-400 hover:bg-white'
                  }
                >
                  <div className="flex min-w-0 items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="break-words font-display text-2xl font-semibold text-chrome-950">{site.name}</p>
                      <p className="mt-2 text-sm text-chrome-700">{site.address}</p>
                    </div>
                    {auth.canWriteOrganization(site.organizationId) ? (
                      <span className="rounded-full bg-moss-300/40 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-moss-500">
                        可編輯
                      </span>
                    ) : (
                      <span className="rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-600">
                        唯讀
                      </span>
                    )}
                  </div>
                </Panel>
              </Link>
            ))}
          </div>

          <div className="xl:hidden">{rail}</div>
        </div>

        <div className="hidden xl:block">{rail}</div>
      </div>
    </div>
  )
}
