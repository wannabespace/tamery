import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { POSTHOG_ROWS_LIMIT } from '@tamery/connection/queries/select-page'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import {
  ShareRefresh,
  shareRefreshLabels,
} from '@tamery/shared/enums/share-refresh'
import type { ShareView } from '@tamery/shared/share'
import {
  SHARE_MAX_ROWS,
  SHARE_PASSWORD_MIN_LENGTH,
  SHARE_ROW_LIMITS,
} from '@tamery/shared/share'
import { objectEntries } from '@tamery/shared/utils'
import { Alert, AlertDescription } from '@tamery/ui/components/alert'
import { MotionCollapse } from '@tamery/ui/components/collapse.motion'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@tamery/ui/components/combobox'
import { FieldDescription } from '@tamery/ui/components/field'
import { Switch } from '@tamery/ui/components/switch'
import { Form, useAppForm } from '@tamery/ui/components/tanstack-form'
import { copy } from '@tamery/ui/lib/copy'
import { useMutation } from '@tanstack/react-query'
import { type } from 'arktype'
import { isFuture } from 'date-fns'
import { AnimatePresence } from 'motion/react'
import { useState } from 'react'
import { toast } from 'sonner'

import { OptionField } from '~/components/option-field'
import { getCapabilities } from '~/core/catalog/capabilities'
import { useConnectionContext } from '~/core/connection/route'
import { checkOrUpgrade } from '~/core/user/permissions'
import { orpc, orpcProxy } from '~/lib/orpc'
import { queryClient } from '~/lib/query-client'
import { shareUrl } from '~/lib/urls'
import { plural } from '~/utils/plural'

import type { Expiry } from './share-expiry'
import { getExpiresAt, getExpiryItems } from './share-expiry'
import type { Share } from './shares-query'
import { sharesQueryOptions } from './shares-query'
import { sameShareView } from './use-table-share'

export const SHARE_FORM_ID = 'share-dialog'

const REFRESH_ITEMS = objectEntries(shareRefreshLabels).map(
  ([value, label]) => ({ label, value })
)

const rowsLabel = (value: number) => `${value.toLocaleString()} rows`

const shareOptions = (dialect: Dialect) => {
  const { flags } = getCapabilities(dialect)
  const meteredReads = flags.includes('meteredReads')
  const maxRows = flags.includes('firstRowsOnly')
    ? POSTHOG_ROWS_LIMIT
    : SHARE_MAX_ROWS
  const rowLimitPresets: number[] = SHARE_ROW_LIMITS.filter(
    (limit) => limit <= maxRows
  )
  return {
    defaultRefresh: meteredReads ? ShareRefresh.Hour : ShareRefresh.Minute,
    maxRows,
    meteredReads,
    refreshItems: meteredReads
      ? REFRESH_ITEMS.filter(({ value }) => value !== ShareRefresh.Live)
      : REFRESH_ITEMS,
    rowLimitPresets,
  }
}

const formDefaults = (
  share: Share | null,
  table: string,
  { defaultRefresh, maxRows }: ReturnType<typeof shareOptions>
) => ({
  description: share?.description ?? '',
  expires: (share?.expiresAt ? 'current' : 'never') as Expiry,
  includeFilters: !share || share.view.filters.length > 0,
  maxRows: String(share?.maxRows ?? maxRows),
  name: share?.name ?? table,
  password: '',
  protect: share?.hasPassword ?? false,
  refresh: share?.refresh ?? defaultRefresh,
})

export const ShareLinkForm = ({
  onCreated,
  share,
  view,
}: {
  onCreated: (id: string) => void
  share: Share | null
  view: ShareView
}) => {
  const { connectionResource, dialect } = useConnectionContext()
  const { filters } = view
  const options = shareOptions(dialect)
  const { maxRows, meteredReads, refreshItems, rowLimitPresets } = options
  const [rowsQuery, setRowsQuery] = useState('')
  const typedRows = Number(rowsQuery.trim())
  const canAddRows =
    /^\d+$/u.test(rowsQuery.trim()) &&
    typedRows >= 1 &&
    typedRows <= maxRows &&
    !rowLimitPresets.includes(typedRows)

  const save = useMutation({
    meta: { event: share ? 'share_updated' : 'share_created' },
    mutationFn: async (values: typeof form.state.values) => {
      const shared = {
        ...view,
        filters: values.includeFilters ? filters : [],
      }
      await orpcProxy.shares.check({
        ...shared,
        dialect,
        resourceId: connectionResource.id,
      })
      return orpc.shares.save.call({
        ...shared,
        connectionResourceId: connectionResource.id,
        id: share?.id,
        description: values.description.trim() || null,
        expiresAt: getExpiresAt(values.expires, share?.expiresAt ?? null),
        maxRows: Number(values.maxRows),
        name: values.name.trim(),
        refresh: values.refresh,
        ...(!values.protect && { password: null }),
        ...(values.protect && values.password && { password: values.password }),
      })
    },
    mutationKey: orpc.shares.save.mutationKey(),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({
        queryKey: sharesQueryOptions.queryKey,
      })
      if (share) {
        toast.success('Share updated')
      } else if (saved) {
        copy(shareUrl(saved.id), 'Link copied')
        onCreated(saved.id)
      }
    },
  })

  const form = useAppForm({
    defaultValues: formDefaults(share, view.table, options),
    onSubmit: ({ value }) => {
      const count = (
        queryClient.getQueryData(sharesQueryOptions.queryKey) ?? []
      ).filter(
        ({ expiresAt }) => expiresAt === null || isFuture(expiresAt)
      ).length
      if (share || checkOrUpgrade('share.create', { count })) {
        save.mutate(value)
      }
    },
    validators: {
      onChange: type({
        name: type(/\S/u).configure({ message: 'Give the share a name.' }),
        password: 'string',
        protect: 'boolean',
      }).narrow(({ password, protect }, ctx) => {
        if (
          !protect ||
          password.length >= SHARE_PASSWORD_MIN_LENGTH ||
          (password === '' && share?.hasPassword)
        ) {
          return true
        }
        return ctx.reject({
          message:
            password === ''
              ? 'Enter a password.'
              : `Use at least ${SHARE_PASSWORD_MIN_LENGTH} characters.`,
          path: ['password'],
        })
      }),
    },
  })

  return (
    <Form id={SHARE_FORM_ID} form={form}>
      <div className="flex flex-col gap-3">
        <form.AppField name="name">
          {(field) => (
            <field.Field>
              <field.Label>Name</field.Label>
              <field.Input autoFocus={!share} autoComplete="off" data-mask />
            </field.Field>
          )}
        </form.AppField>
        <form.AppField name="description">
          {(field) => (
            <field.Field>
              <field.Label>Description</field.Label>
              <field.Textarea placeholder="Optional" rows={2} data-mask />
            </field.Field>
          )}
        </form.AppField>
        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="refresh">
            {(field) => (
              <field.Field>
                <field.Label>Refresh</field.Label>
                <field.Select items={refreshItems} />
              </field.Field>
            )}
          </form.AppField>
          <form.AppField name="expires">
            {(field) => (
              <field.Field>
                <field.Label>Expires</field.Label>
                <field.Select
                  items={getExpiryItems(share?.expiresAt ?? null)}
                />
              </field.Field>
            )}
          </form.AppField>
        </div>
        <form.AppField name="maxRows">
          {(field) => {
            const trimmed = rowsQuery.trim()
            const items = [
              ...new Set([
                ...rowLimitPresets.map(String),
                ...(rowLimitPresets.includes(Number(field.state.value))
                  ? []
                  : [field.state.value]),
                ...(canAddRows ? [trimmed] : []),
              ]),
            ]
            return (
              <field.Field>
                <field.Label>Max rows</field.Label>
                <Combobox
                  items={items}
                  value={field.state.value}
                  onValueChange={(next) =>
                    next !== null && field.handleChange(next)
                  }
                  inputValue={rowsQuery}
                  onInputValueChange={setRowsQuery}
                  onOpenChange={(open) => !open && setRowsQuery('')}
                  autoHighlight
                >
                  <ComboboxTrigger id={field.name}>
                    <ComboboxValue>
                      {(value: string) => rowsLabel(Number(value))}
                    </ComboboxValue>
                  </ComboboxTrigger>
                  <ComboboxContent>
                    <ComboboxInput
                      showTrigger={false}
                      placeholder="Enter a number…"
                      inputMode="numeric"
                      autoComplete="off"
                    />
                    <ComboboxList>
                      {(item: string) => (
                        <ComboboxItem key={item} value={item}>
                          {canAddRows && item === trimmed
                            ? `Use ${rowsLabel(Number(item))}`
                            : rowsLabel(Number(item))}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                    <ComboboxEmpty>
                      {`Up to ${rowsLabel(maxRows)}.`}
                    </ComboboxEmpty>
                  </ComboboxContent>
                </Combobox>
                <FieldDescription>
                  The most rows viewers can scroll through.
                </FieldDescription>
              </field.Field>
            )
          }}
        </form.AppField>
        {filters.length > 0 && (
          <form.AppField name="includeFilters">
            {(field) => (
              <OptionField
                htmlFor={field.name}
                title="Apply the table’s filters"
                description={`Viewers see only the rows the ${plural(filters.length, 'filter')} let through.`}
              >
                <Switch
                  id={field.name}
                  size="sm"
                  checked={field.state.value}
                  onCheckedChange={field.handleChange}
                />
              </OptionField>
            )}
          </form.AppField>
        )}
        <form.AppField name="protect">
          {(field) => (
            <OptionField
              htmlFor={field.name}
              title="Require a password"
              description="Viewers enter it once to open the link."
            >
              <Switch
                id={field.name}
                size="sm"
                checked={field.state.value}
                onCheckedChange={field.handleChange}
              />
            </OptionField>
          )}
        </form.AppField>
        <form.Subscribe selector={(state) => state.values.protect}>
          {(protect) => (
            <AnimatePresence initial={false}>
              {protect && (
                <MotionCollapse key="share-password">
                  <form.AppField name="password">
                    {(field) => (
                      <field.Field>
                        <field.Label>Password</field.Label>
                        <field.PasswordInput
                          autoComplete="new-password"
                          placeholder={
                            share?.hasPassword ? 'Unchanged' : undefined
                          }
                        />
                      </field.Field>
                    )}
                  </form.AppField>
                </MotionCollapse>
              )}
            </AnimatePresence>
          )}
        </form.Subscribe>
        {share && (
          <form.Subscribe selector={(state) => state.values.includeFilters}>
            {(includeFilters) =>
              !sameShareView(share.view, {
                ...view,
                filters: includeFilters ? filters : [],
              }) && (
                <p className="text-muted-foreground text-xs">
                  This link was saved with other columns, filters or sort.
                  Saving moves it to what the table shows now.
                </p>
              )
            }
          </form.Subscribe>
        )}
        <p className="text-muted-foreground text-xs">
          {`Anyone with the link sees the ${plural(view.columns.length, 'column')} the table shows, in its order. Tamery’s servers read the rows from your database each time the link refreshes; viewers can scroll and open any cell to read it, never sort or edit.${meteredReads ? ' Each read spends your project’s hourly read budget.' : ''}`}
        </p>
        {save.error && (
          <Alert variant="error">
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
            <AlertDescription data-mask className="wrap-break-word">
              {save.error.message}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </Form>
  )
}
