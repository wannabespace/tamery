import { HugeiconsIcon } from '@hugeicons/react'
import { isInternalHost } from '@tamery/connection/hosts'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tamery/ui/components/select'
import { useSelector } from '@tanstack/react-form'

import { isReachableFromWeb } from '~/core/connection/fetching-config'
import { connectPickedMachine } from '~/modules/machine/connect-machine'
import { useRunsOnOptions } from '~/modules/machine/runs-on-options'

import type { ConnectionForm } from '../lib/connection-form'
import { getEngineFields } from '../lib/engine-fields'

export const RunsOnField = ({ form }: { form: ConnectionForm }) => {
  const items = useRunsOnOptions(
    useSelector(form.store, ({ values }) => values.runsOn),
    useSelector(form.store, ({ values }) =>
      isReachableFromWeb(values, {
        isInternal: isInternalHost(values.host.trim()),
        usesSsh: values.sshEnabled && !!getEngineFields(values).sshTunnel,
      })
    )
  )
  if (items.length === 0) {
    return null
  }

  return (
    <form.AppField name="runsOn">
      {(field) => (
        <field.Field orientation="row">
          <field.Label>Runs on</field.Label>
          <Select
            items={items}
            value={field.state.value}
            onValueChange={(next) => {
              field.handleChange(next)
              connectPickedMachine(next)
            }}
          >
            <SelectTrigger
              id={field.name}
              aria-labelledby={`${field.name}-label`}
              variant="flat"
              onBlur={field.handleBlur}
            >
              <SelectValue>
                {(value: string | null) => {
                  const item = items.find((option) => option.value === value)
                  return (
                    item && (
                      <>
                        <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                        <span data-mask>{item.label}</span>
                        <span className="text-muted-foreground truncate">
                          {item.description}
                        </span>
                      </>
                    )
                  )
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {items.map(({ description, icon, label, value }) => (
                <SelectItem key={value ?? 'here'} value={value}>
                  <HugeiconsIcon icon={icon} strokeWidth={2} />
                  <span className="flex flex-col">
                    <span data-mask>{label}</span>
                    <span className="text-muted-foreground text-xs">
                      {description}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </field.Field>
      )}
    </form.AppField>
  )
}
