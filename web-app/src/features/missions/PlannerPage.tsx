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
  siteId: z.string().min(1, '請選擇場域'),
  missionName: z.string().min(1, '請輸入任務名稱'),
  operatingProfile: z.enum(['outdoor_gps_patrol', 'indoor_no_gps']),
  launchLat: z.coerce.number(),
  launchLng: z.coerce.number(),
  waypoint1Lat: z.coerce.number(),
  waypoint1Lng: z.coerce.number(),
  waypoint2Lat: z.coerce.number(),
  waypoint2Lng: z.coerce.number(),
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
        launchPoint: {
          launchPointId: 'launch-main',
          label: 'main-launch',
          location: { lat: payload.launchLat, lng: payload.launchLng },
        },
        orderedWaypoints: [
          {
            waypointId: 'wp-01',
            sequence: 1,
            holdSeconds: 0,
            location: { lat: payload.waypoint1Lat, lng: payload.waypoint1Lng },
          },
          {
            waypointId: 'wp-02',
            sequence: 2,
            holdSeconds: 0,
            location: { lat: payload.waypoint2Lat, lng: payload.waypoint2Lng },
          },
        ],
        routingMode: 'road_network_following',
        flightProfile: {
          defaultAltitudeM: 35,
          defaultSpeedMps: 4,
          maxApproachSpeedMps: 1,
        },
        operatingProfile: payload.operatingProfile,
        implicitReturnToLaunch: true,
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
      missionName: 'patrol-demo',
      operatingProfile: 'outdoor_gps_patrol',
      launchLat: 25.03391,
      launchLng: 121.56452,
      waypoint1Lat: 25.03412,
      waypoint1Lng: 121.56472,
      waypoint2Lat: 25.03441,
      waypoint2Lng: 121.56501,
    },
  })

  const organizationId = useWatch({ control, name: 'organizationId' })
  const visibleSites = (sitesQuery.data ?? []).filter((site) => site.organizationId === organizationId)

  const onSubmit = handleSubmit(async (values) => {
    try {
      await planMission.mutateAsync(values)
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setError('root', { message: formatApiError(detail, '任務建立失敗，請稍後再試。') })
    }
  })

  if (choices.length === 0) {
    return (
      <EmptyState
        title="目前沒有可寫入的組織"
        body="請先建立組織，或確認目前帳號具備 customer_admin 權限。"
      />
    )
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="任務規劃"
        title="建立巡邏任務"
        subtitle="以巡邏航線形式建立起降點、排序航點與執行 profile。"
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
              <Field label="場域" error={errors.siteId?.message}>
                <Select {...register('siteId')}>
                  <option value="">請選擇場域</option>
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
              <Field label="執行 Profile" error={errors.operatingProfile?.message}>
                <Select {...register('operatingProfile')}>
                  <option value="outdoor_gps_patrol">戶外 GPS 巡邏</option>
                  <option value="indoor_no_gps">室內無 GPS 保守模式</option>
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="起降點緯度" error={errors.launchLat?.message}>
                <Input step="0.00001" type="number" {...register('launchLat')} />
              </Field>
              <Field label="起降點經度" error={errors.launchLng?.message}>
                <Input step="0.00001" type="number" {...register('launchLng')} />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="航點 1 緯度" error={errors.waypoint1Lat?.message}>
                <Input step="0.00001" type="number" {...register('waypoint1Lat')} />
              </Field>
              <Field label="航點 1 經度" error={errors.waypoint1Lng?.message}>
                <Input step="0.00001" type="number" {...register('waypoint1Lng')} />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="航點 2 緯度" error={errors.waypoint2Lat?.message}>
                <Input step="0.00001" type="number" {...register('waypoint2Lat')} />
              </Field>
              <Field label="航點 2 經度" error={errors.waypoint2Lng?.message}>
                <Input step="0.00001" type="number" {...register('waypoint2Lng')} />
              </Field>
            </div>

            {errors.root?.message ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errors.root.message}
              </div>
            ) : null}

            <div className="flex justify-end">
              <ActionButton disabled={planMission.isPending} type="submit">
                {planMission.isPending ? '建立中' : '建立任務'}
              </ActionButton>
            </div>
          </form>
        </Panel>

        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">規劃說明</p>
          <div className="mt-4 space-y-3 text-sm text-chrome-700">
            <p>戶外 GPS 巡邏會以起降點與排序航點產生 mission.kmz。</p>
            <p>系統會自動啟用隱式返航，因此不需要顯式新增最後一點回到起降點。</p>
            <p>室內 profile 只保留保守模式，不承諾航點自動巡邏。</p>
          </div>
        </Panel>
      </div>
    </div>
  )
}
