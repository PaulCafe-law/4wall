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
  organizationId: z.string().min(1, '請選擇組織'),
  name: z.string().min(1, '請輸入場址名稱'),
  address: z.string().min(1, '請輸入地址'),
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
  const selectedSite =
    filteredSites.find((site) => site.siteId === siteId) ?? filteredSites[0] ?? null

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createSite.mutateAsync(values)
      reset()
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setError('root', { message: formatApiError(detail, '建立場址失敗，請稍後再試。') })
    }
  })

  const rail = selectedSite ? (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">場址詳情</p>
      <h2 className="mt-3 font-display text-2xl font-semibold text-chrome-950">{selectedSite.name}</h2>
      <div className="mt-4">
        <DataList
          rows={[
            { label: '地址', value: selectedSite.address },
            { label: '外部參考', value: selectedSite.externalRef ?? '未填寫' },
            {
              label: '座標',
              value: `${selectedSite.location.lat.toFixed(5)}, ${selectedSite.location.lng.toFixed(5)}`,
            },
            { label: '最近更新', value: formatDate(selectedSite.updatedAt) },
            { label: '備註', value: selectedSite.notes || '目前沒有備註' },
          ]}
        />
      </div>
    </Panel>
  ) : (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">尚未選取場址</p>
      <p className="mt-3 text-sm text-chrome-700">
        從左側列表選一個場址，就能查看地址、座標與備註。若你有管理權限，也可以新增場址。
      </p>
    </Panel>
  )

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="客戶工作區"
        title="場址"
        subtitle="管理任務所屬的場址資料。這些資料會在建立任務請求時用來指定作業地點與組織。"
        action={
          choices.length > 0 ? (
            <Modal
              open={isOpen}
              onOpenChange={setIsOpen}
              title="新增場址"
              description="填入場址基本資料後，這個場址就能用在後續的任務請求。"
              trigger={<ActionButton>新增場址</ActionButton>}
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
                <Field label="場址名稱" error={errors.name?.message}>
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
                    {createSite.isPending ? '建立中…' : '建立場址'}
                  </ActionButton>
                </div>
              </form>
            </Modal>
          ) : null
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="目前場址數" value={filteredSites.length} hint="顯示你目前可查看的場址。" />
        <Metric label="可建立場址的組織" value={choices.length} hint="若為 0，表示你目前只有檢視權限。" />
        <Metric label="搜尋狀態" value={formatSearchMode(Boolean(deferredSearch))} hint="輸入關鍵字即可篩選場址。" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Panel>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">場址列表</p>
                <p className="mt-1 text-sm text-chrome-700">可依名稱、地址或外部參考進行搜尋。</p>
              </div>
              <div className="w-full md:w-80">
                <Input
                  placeholder="搜尋場址"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
          </Panel>

          {sitesQuery.isLoading ? (
            <Panel>
              <p className="text-sm text-chrome-700">正在讀取場址資料…</p>
            </Panel>
          ) : null}

          {!sitesQuery.isLoading && filteredSites.length === 0 ? (
            <EmptyState
              title={allSites.length === 0 ? '目前還沒有場址' : '找不到符合條件的場址'}
              body={
                allSites.length === 0
                  ? '先建立第一個場址，之後就能在新增任務請求時指定它。'
                  : '請調整搜尋條件，或清空關鍵字後重新查看全部場址。'
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
                        可管理
                      </span>
                    ) : (
                      <span className="rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-600">
                        僅檢視
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
