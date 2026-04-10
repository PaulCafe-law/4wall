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
  ShellSection,
  TextArea,
  formatDate,
} from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAuthedMutation, useAuthedQuery } from '../../lib/auth-query'
import { useOrganizationChoices } from '../../lib/organization-choices'

const siteSchema = z.object({
  organizationId: z.string().min(1, 'Organization is required'),
  name: z.string().min(1, 'Name is required'),
  address: z.string().min(1, 'Address is required'),
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
      const detail = error instanceof ApiError ? error.detail : 'Unable to create site'
      setError('root', { message: detail })
    }
  })

  const rail = selectedSite ? (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Site detail</p>
      <h2 className="mt-3 font-display text-2xl font-semibold text-chrome-950">{selectedSite.name}</h2>
      <div className="mt-4">
        <DataList
          rows={[
            { label: 'Address', value: selectedSite.address },
            { label: 'External ref', value: selectedSite.externalRef ?? 'Not set' },
            {
              label: 'Location',
              value: `${selectedSite.location.lat.toFixed(5)}, ${selectedSite.location.lng.toFixed(5)}`,
            },
            { label: 'Updated', value: formatDate(selectedSite.updatedAt) },
            { label: 'Notes', value: selectedSite.notes || 'No notes yet' },
          ]}
        />
      </div>
    </Panel>
  ) : (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">No site selected</p>
      <p className="mt-3 text-sm text-chrome-700">
        Pick a site to inspect address, location, and ops notes. Tablet mode keeps this panel below
        the site list.
      </p>
    </Panel>
  )

  return (
    <div className="space-y-6">
      <ShellSection
        eyebrow="Customer surface"
        title="Sites"
        subtitle="Manage inspection locations, addresses, and org-scoped coordinates before a mission request enters planning."
        action={
          choices.length > 0 ? (
            <Modal
              open={isOpen}
              onOpenChange={setIsOpen}
              title="Create site"
              description="Desktop beta supports direct site creation for writable organizations."
              trigger={<ActionButton>New Site</ActionButton>}
            >
              <form className="space-y-4" onSubmit={onSubmit}>
                <Field label="Organization" error={errors.organizationId?.message}>
                  <select
                    className="w-full rounded-2xl border border-chrome-300 bg-white px-4 py-3 text-sm"
                    {...register('organizationId')}
                  >
                    {choices.map((choice) => (
                      <option key={choice.organizationId} value={choice.organizationId}>
                        {choice.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Site name" error={errors.name?.message}>
                  <Input {...register('name')} />
                </Field>
                <Field label="Address" error={errors.address?.message}>
                  <Input {...register('address')} />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Latitude" error={errors.lat?.message}>
                    <Input type="number" step="0.00001" {...register('lat')} />
                  </Field>
                  <Field label="Longitude" error={errors.lng?.message}>
                    <Input type="number" step="0.00001" {...register('lng')} />
                  </Field>
                </div>
                <Field label="External reference" error={errors.externalRef?.message}>
                  <Input {...register('externalRef')} />
                </Field>
                <Field label="Notes" error={errors.notes?.message}>
                  <TextArea {...register('notes')} />
                </Field>
                {errors.root?.message ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errors.root.message}
                  </div>
                ) : null}
                <div className="flex justify-end">
                  <ActionButton disabled={createSite.isPending} type="submit">
                    {createSite.isPending ? 'Creating…' : 'Create Site'}
                  </ActionButton>
                </div>
              </form>
            </Modal>
          ) : null
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Visible sites" value={filteredSites.length} hint="Scoped to the current role map." />
        <Metric label="Writable orgs" value={choices.length} hint="Zero means read-only beta access." />
        <Metric
          label="Search mode"
          value={deferredSearch ? 'filtered' : 'all'}
          hint="Deferred client-side search keeps the list responsive."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Panel>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-chrome-500">Search sites</p>
                <p className="mt-1 text-sm text-chrome-700">
                  Filter by site name, address, or external reference.
                </p>
              </div>
              <div className="w-full md:w-80">
                <Input
                  placeholder="Search sites"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
          </Panel>

          {sitesQuery.isLoading ? (
            <Panel>
              <p className="text-sm text-chrome-700">Loading sites…</p>
            </Panel>
          ) : null}

          {!sitesQuery.isLoading && filteredSites.length === 0 ? (
            <EmptyState
              title={allSites.length === 0 ? 'No site yet' : 'No result'}
              body={
                allSites.length === 0
                  ? 'Create the first site before sending a mission request into planning.'
                  : 'The current search did not match any visible site.'
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
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-display text-2xl font-semibold text-chrome-950">{site.name}</p>
                      <p className="mt-2 text-sm text-chrome-700">{site.address}</p>
                    </div>
                    {auth.canWriteOrganization(site.organizationId) ? (
                      <span className="rounded-full bg-moss-300/40 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-moss-500">
                        writable
                      </span>
                    ) : (
                      <span className="rounded-full bg-chrome-100 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-chrome-600">
                        read only
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
