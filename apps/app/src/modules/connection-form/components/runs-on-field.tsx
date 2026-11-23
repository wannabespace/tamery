import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tamery/ui/components/select'
import { useSubscription } from 'seitu/react'

import { machinePairings, useMachines } from '~/core/runtime/machine/pairing'

import type { ConnectionForm } from '../lib/connection-form'

const HERE = window.electron
  ? { description: 'The desktop app on this computer.', label: 'This computer' }
  : {
      description: 'Tamery’s servers, for public hosts.',
      label: 'Tamery Cloud',
    }

export const RunsOnField = ({ form }: { form: ConnectionForm }) => {
  const machines = useMachines()
  const pairings = useSubscription(machinePairings)
  if (machines.length === 0) {
    return null
  }
  const items = [
    { description: HERE.description, label: HERE.label, value: null },
    ...machines.map(({ id, name }) => ({
      description: pairings[id]
        ? 'Connected to this browser.'
        : 'Not connected to this browser yet.',
      label: name,
      value: id,
    })),
  ]

  return (
    <form.AppField name="machineId">
      {(field) => (
        <field.Field orientation="row">
          <field.Label>Runs on</field.Label>
          <Select
            items={items}
            value={field.state.value}
            onValueChange={(next) => field.handleChange(next)}
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
              {items.map(({ description, label, value }) => (
                <SelectItem key={value ?? 'here'} value={value}>
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
