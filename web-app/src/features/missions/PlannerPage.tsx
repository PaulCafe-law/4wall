import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import {
  ActionButton,
  EmptyState,
  Field,
  Input,
  Panel,
  Select,
  ShellSection,
} from '../../components/ui'
import { ApiError, api } from '../../lib/api'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import { useOrganizationChoices } from '../../lib/organization-choices'
import { formatApiError } from '../../lib/presentation'

const plannerSchema = z.object({
  organizationId: z.string().min(1, '請選擇組織'),
  siteId: z.string().min(1, '請選擇場域'),
  missionName: z.string().min(1, '請輸入任務名稱'),
  launchLat: z.coerce.number(),
  launchLng: z.coerce.number(),
  waypointLat: z.coerce.number(),
  waypointLng: z.coerce.number(),
  waypointAltitudeM: z.coerce.number().min(1, '巡邏點高度至少要大於 1 公尺'),
  waypointDwellSeconds: z.coerce.number().min(0, '停留秒數不能小於 0'),
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
        launchPoint: { lat: payload.launchLat, lng: payload.launchLng },
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
        waypoints: [
          {
            waypointId: 'wp-01',
            kind: 'transit',
            label: 'patrol-point-01',
            lat: payload.waypointLat,
            lng: payload.waypointLng,
            altitudeM: payload.waypointAltitudeM,
            dwellSeconds: payload.waypointDwellSeconds,
            headingDeg: 0,
          },
        ],
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
      missionName: 'security-patrol-demo',
      launchLat: 25.03391,
      launchLng: 121.56452,
      waypointLat: 25.03441,
      waypointLng: 121.56501,
      waypointAltitudeM: 35,
      waypointDwellSeconds: 8,
    },
  })

  const organizationId = useWatch({ control, name: 'organizationId' })
  const visibleSites = (sitesQuery.data ?? []).filter((site) => site.organizationId === organizationId)

  const onSubmit = handleSubmit(async (values) => {
    try {
      await planMission.mutateAsync(values)
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : undefined
      setError('root', { message: formatApiError(detail, '建立任務失敗，請檢查場域與路徑資料。') })
    }
  })

  if (choices.length === 0) {
    return (
      <EmptyState
        title="目前沒有可寫入的組織"
        body="請先加入具寫入權限的組織，再建立任務請求。"
      />
    )
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="任務建立"
        title="新增任務請求"
        subtitle="用 route-owned launch point 與巡邏 waypoint 建立保全巡檢任務。起點與巡邏點屬於任務規劃輸入，實際 mission bundle 會自動閉合回到 launch point。"
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

            <Field label="任務名稱" error={errors.missionName?.message}>
              <Input {...register('missionName')} />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="起降點緯度" error={errors.launchLat?.message}>
                <Input step="0.00001" type="number" {...register('launchLat')} />
              </Field>
              <Field label="起降點經度" error={errors.launchLng?.message}>
                <Input step="0.00001" type="number" {...register('launchLng')} />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="巡邏點緯度" error={errors.waypointLat?.message}>
                <Input step="0.00001" type="number" {...register('waypointLat')} />
              </Field>
              <Field label="巡邏點經度" error={errors.waypointLng?.message}>
                <Input step="0.00001" type="number" {...register('waypointLng')} />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="巡邏點高度（公尺）" error={errors.waypointAltitudeM?.message}>
                <Input step="1" type="number" {...register('waypointAltitudeM')} />
              </Field>
              <Field label="停留秒數" error={errors.waypointDwellSeconds?.message}>
                <Input step="1" type="number" {...register('waypointDwellSeconds')} />
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
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">工作區說明</p>
          <div className="mt-4 space-y-4 text-sm text-chrome-700">
            <p>這個任務建立頁面只要求 launch point 與巡邏 waypoint，不再要求 viewpoint。</p>
            <p>route geometry 仍由 internal 在控制平面審核與發布，mission bundle 會固定採 implicit return-to-launch。</p>
            <p>鏡頭控制屬於執行期能力，不是規劃期資料模型的一部分。</p>
          </div>
        </Panel>
      </div>
    </div>
  )
}
