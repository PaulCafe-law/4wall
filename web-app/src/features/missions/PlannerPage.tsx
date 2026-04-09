import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { ActionButton, EmptyState, Field, Input, Panel, Select, ShellSection } from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import { useOrganizationChoices } from '../../lib/organization-choices'

const plannerSchema = z.object({
  organizationId: z.string().min(1, 'Organization is required'),
  siteId: z.string().min(1, 'Site is required'),
  missionName: z.string().min(1, 'Mission name is required'),
  buildingId: z.string().min(1, 'Building id is required'),
  buildingLabel: z.string().min(1, 'Building label is required'),
  originLat: z.coerce.number(),
  originLng: z.coerce.number(),
  viewpointLat: z.coerce.number(),
  viewpointLng: z.coerce.number(),
  yawDeg: z.coerce.number(),
  distanceToFacadeM: z.coerce.number().min(1),
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
      const detail = error instanceof ApiError ? error.detail : 'Planner request failed'
      setError('root', { message: detail })
    }
  })

  if (choices.length === 0) {
    return (
      <EmptyState
        title="Forbidden role"
        body="This account can view missions but does not have a writable organization for planner submissions."
      />
    )
  }

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Planner workspace"
        title="New mission request"
        subtitle="Desktop-first map workflow condensed into a structured beta form: org, site, building context, and one viewpoint seed."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Organization" error={errors.organizationId?.message}>
                <Select {...register('organizationId')}>
                  {choices.map((choice) => (
                    <option key={choice.organizationId} value={choice.organizationId}>
                      {choice.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Site" error={errors.siteId?.message}>
                <Select {...register('siteId')}>
                  <option value="">Select a site</option>
                  {visibleSites.map((site) => (
                    <option key={site.siteId} value={site.siteId}>
                      {site.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Mission name" error={errors.missionName?.message}>
                <Input {...register('missionName')} />
              </Field>
              <Field label="Building id" error={errors.buildingId?.message}>
                <Input {...register('buildingId')} />
              </Field>
            </div>

            <Field label="Building label" error={errors.buildingLabel?.message}>
              <Input {...register('buildingLabel')} />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Origin latitude" error={errors.originLat?.message}>
                <Input step="0.00001" type="number" {...register('originLat')} />
              </Field>
              <Field label="Origin longitude" error={errors.originLng?.message}>
                <Input step="0.00001" type="number" {...register('originLng')} />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Viewpoint latitude" error={errors.viewpointLat?.message}>
                <Input step="0.00001" type="number" {...register('viewpointLat')} />
              </Field>
              <Field label="Viewpoint longitude" error={errors.viewpointLng?.message}>
                <Input step="0.00001" type="number" {...register('viewpointLng')} />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Yaw degrees" error={errors.yawDeg?.message}>
                <Input step="1" type="number" {...register('yawDeg')} />
              </Field>
              <Field label="Facade distance (m)" error={errors.distanceToFacadeM?.message}>
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
                {planMission.isPending ? 'Planning…' : 'Submit Mission Request'}
              </ActionButton>
            </div>
          </form>
        </Panel>

        <Panel>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Workspace notes</p>
          <div className="mt-4 space-y-4 text-sm text-chrome-700">
            <p>Planning in progress surfaces as soon as the request enters the server pipeline.</p>
            <p>The backend still stays planning-only. Android remains the flight-critical runtime.</p>
            <p>Artifacts publish into the mission detail panel once generation completes.</p>
          </div>
        </Panel>
      </div>
    </div>
  )
}
