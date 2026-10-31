import { SYNC_TYPE_LABELS, SyncType } from '@tamery/shared/enums/sync-type'
import { SelectItem } from '@tamery/ui/components/select'

import type { ConnectionForm } from '../lib/connection-form'

const SYNC_OPTIONS: Record<SyncType, { description: string; label: string }> = {
  [SyncType.Cloud]: {
    description: 'Everything syncs, encrypted.',
    label: SYNC_TYPE_LABELS[SyncType.Cloud],
  },
  [SyncType.CloudWithoutSecrets]: {
    description: 'Passwords and keys stay on this device.',
    label: SYNC_TYPE_LABELS[SyncType.CloudWithoutSecrets],
  },
  [SyncType.CloudWithoutConnectionString]: {
    description: 'Only the name and color sync.',
    label: SYNC_TYPE_LABELS[SyncType.CloudWithoutConnectionString],
  },
}

const SYNC_TYPES = Object.values(SyncType).map((syncType) => ({
  label: SYNC_OPTIONS[syncType].label,
  value: syncType,
}))

export const SyncField = ({ form }: { form: ConnectionForm }) => (
  <form.AppField name="syncType">
    {(field) => (
      <field.Field orientation="row">
        <field.Label>Sync</field.Label>
        <field.Select
          items={SYNC_TYPES}
          variant="flat"
          renderValue={(syncType) => (
            <>
              {SYNC_OPTIONS[syncType].label}
              <span className="text-muted-foreground truncate">
                {SYNC_OPTIONS[syncType].description}
              </span>
            </>
          )}
        >
          {SYNC_TYPES.map(({ label, value }) => (
            <SelectItem key={value} value={value}>
              <span className="flex flex-col">
                {label}
                <span className="text-muted-foreground text-xs">
                  {SYNC_OPTIONS[value].description}
                </span>
              </span>
            </SelectItem>
          ))}
        </field.Select>
      </field.Field>
    )}
  </form.AppField>
)
