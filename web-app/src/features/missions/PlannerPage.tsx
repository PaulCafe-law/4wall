import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { ActionButton, EmptyState, Field, Input, Panel, Select, ShellSection } from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import { useOrganizationChoices } from '../../lib/organization-choices'
import { formatApiError } from '../../lib/presentation'

const plannerSchema = z.object({
  organizationId: z.string().min(1, '請選擇組織'),
  siteId: z.string().min(1, '請選擇場址'),
  missionName: z.string().min(1, '請輸入任務名稱'),
  buildingId: z.string().min(1, '請輸入建物代稱'),
  buildingLabel: z.string().min(1, '請輸入建物名稱'),
  originLat: z.coerce.number(),
  originLng: z.coerce.number(),
  viewpointLat: z.coerce.number(),
  viewpointLng: z.coerce.number(),
  yawDeg: z.coerce.number(),
  distanceToFacadeM: z.coerce.number().min(1, '距離建面至少需要 1 公尺'),
})

type PlannerFormInput = z.input<typeof plannerSchema>
type PlannerFormValues = z.output<typeof plannerSchema>

export function PlannerPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { choices } = useOrganizationChoices('write')
  const sitesQuery = useAuthedQuery({
    queryKey: ['sites'],
    queryFn: api.listSites,
    staleTime: 15_000,
  })

  const planMission = useAuthedMutation({
    mutationKey: ['missions', 'plan'],
    mutationFn: ({ token, payload }: { token: string; payload: PlannerFormValues }) =>
      api.planMission(token, {
        organizationId: payload.organizationId,
        siteId: payload.siteId,
        missionName: payload.missionName,
        origin: { lat: payload.originLat, lng: payload.originLng },
        targetBuilding: { buildingId: payload.buildingId, label: payload.buildingLabel },
        routingMode: 'road_network_following',
        corridorPolicy: {
          defaultHalfWidthM: 8,
          maxHalfWidthM: 12,
          branchConfirmRadiusM: 18,
        },
        flightProfile: {
          defaultAltitudeM: 35,
          defaultSpeedMps: 4,
          maxApproachSpeedMps: 1,
        },
        inspectionIntent: {
          viewpoints: [
            {
              viewpointId: 'vp-01',
              label: 'north-east-facade',
              lat: payload.viewpointLat,
              lng: payload.viewpointLng,
              yawDeg: payload.yawDeg,
              distanceToFacadeM: payload.distanceToFacadeM,
            },
          ],
        },
        demoMode: false,
      }),
    onSuccess: async (mission) => {
      await queryClient.invalidateQueries({ queryKey: ['missions'] })
      navigate(`/missions/${mission.missionId}`)
    },
  })

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    setError,
  } = useForm<PlannerFormInput, undefined, PlannerFormValues>({
    resolver: zodResolver(plannerSchema),
    defaultValues: {
      organizationId: choices[0]?.organizationId ?? '',
      siteId: '',
      missionName: 'building-a-demo',
      buildingId: 'tower-a',
      buildingLabel: 'Tower A',
      originLat: 25.03391,
      originLng: 121.56452,
      viewpointLat: 25.03441,
      viewpointLng: 121.56501,
      yawDeg: 225,
      distanceToFacadeM: 12,
    },
  })

  const organizationId = useWatch({ control, name: 'organizationId' })
  const visibleSites = (sitesQuery.data ?? []).filter((site) => site.organizationId === organizationId)

  const onSubmit = handleSubmit(async (values) => {
    try {
      await planMission.mutateAsync(values)
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setError('root', { message: formatApiError(detail, '建立任務請求失敗，請稍後再試。') })
    }
  })

  if (choices.length === 0) {
    return (
      <EmptyState
        title="目前沒有可建立任務的組織"
        body="你的帳號還沒有可寫入的組織，因此目前無法建立任務請求。"
      />
    )
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="任務請求"
        title="新增任務請求"
        subtitle="填入任務基本資料、場址與觀測點資訊後，系統會建立新的任務規劃請求。"
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="組織" error={errors.organizationId?.message}>
                <Select {...register('organizationId')}>
                  {choices.map((choice) => (
                    <option key={choice.organizationId} value={choice.organizationId}>
                      {choice.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="場址" error={errors.siteId?.message}>
                <Select {...register('siteId')}>
                  <option value="">請選擇場址</option>
                  {visibleSites.map((site) => (
                    <option key={site.siteId} value={site.siteId}>
                      {site.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="任務名稱" error={errors.missionName?.message}>
                <Input {...register('missionName')} />
              </Field>
              <Field label="建物代稱" error={errors.buildingId?.message}>
                <Input {...register('buildingId')} />
              </Field>
            </div>

            <Field label="建物名稱" error={errors.buildingLabel?.message}>
              <Input {...register('buildingLabel')} />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="起點緯度" error={errors.originLat?.message}>
                <Input step="0.00001" type="number" {...register('originLat')} />
              </Field>
              <Field label="起點經度" error={errors.originLng?.message}>
                <Input step="0.00001" type="number" {...register('originLng')} />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="觀測點緯度" error={errors.viewpointLat?.message}>
                <Input step="0.00001" type="number" {...register('viewpointLat')} />
              </Field>
              <Field label="觀測點經度" error={errors.viewpointLng?.message}>
                <Input step="0.00001" type="number" {...register('viewpointLng')} />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="鏡頭朝向角度" error={errors.yawDeg?.message}>
                <Input step="1" type="number" {...register('yawDeg')} />
              </Field>
              <Field label="距離建面（公尺）" error={errors.distanceToFacadeM?.message}>
                <Input step="0.1" type="number" {...register('distanceToFacadeM')} />
              </Field>
            </div>

            {errors.root?.message ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errors.root.message}
              </div>
            ) : null}

            <div className="flex justify-end">
              <ActionButton disabled={planMission.isPending} type="submit">
                {planMission.isPending ? '建立中…' : '送出任務請求'}
              </ActionButton>
            </div>
          </form>
        </Panel>

        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">送出後會發生什麼</p>
          <div className="mt-4 space-y-4 text-sm text-chrome-700">
            <p>系統會建立一筆新的任務請求，並進入規劃流程。</p>
            <p>規劃完成後，任務會在任務清單中顯示為「已就緒」，你可進入任務詳情下載成果。</p>
            <p>若規劃失敗，請從任務詳情查看狀態與目前的成果資訊，必要時通知內部支援協助處理。</p>
          </div>
        </Panel>
      </div>
    </div>
  )
}
