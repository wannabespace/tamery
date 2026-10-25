import { engines } from '@tamery/shared/enums/connection-type'
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@tamery/ui/components/combobox'
import { ConnectionIcon } from '@tamery/ui/components/icons/connection-icon'
import { useSelector } from '@tanstack/react-form'
import { useState } from 'react'

import type { ConnectionForm } from '../lib/connection-form'
import { switchEngine } from '../lib/connection-form'

type Engine = (typeof engines)[number]

const engineGroups = [
  { items: engines.filter(({ provider }) => !provider), label: 'Databases' },
  { items: engines.filter(({ provider }) => provider), label: 'Providers' },
]

const EngineLabel = ({ label, provider, type }: Engine) => (
  <>
    <ConnectionIcon type={type} provider={provider} />
    {label}
  </>
)

export const EngineField = ({
  form,
  locked,
}: {
  form: ConnectionForm
  locked: (field: string) => boolean
}) => {
  const engine = useSelector(form.store, ({ values }) =>
    engines.find(
      ({ provider, type }) =>
        type === values.type && provider === values.provider
    )
  )
  const [query, setQuery] = useState('')

  return (
    <form.AppField name="type">
      {(field) => (
        <field.Field orientation="row">
          <field.Label>Engine</field.Label>
          <Combobox<Engine>
            items={engineGroups}
            value={engine}
            onValueChange={(next) => next && switchEngine(form, next)}
            itemToStringLabel={(item) => item.label}
            isItemEqualToValue={(item, value) =>
              item.type === value.type && item.provider === value.provider
            }
            inputValue={query}
            onInputValueChange={setQuery}
            onOpenChange={(open) => !open && setQuery('')}
            disabled={locked(field.name)}
            autoHighlight
          >
            <ComboboxTrigger id={field.name} variant="flat" className="flex-1">
              <span className="flex flex-1 items-center gap-2">
                <ComboboxValue>
                  {(value: Engine) => <EngineLabel {...value} />}
                </ComboboxValue>
              </span>
            </ComboboxTrigger>
            <ComboboxContent>
              <ComboboxInput
                showTrigger={false}
                placeholder="Search engines…"
                autoComplete="off"
              />
              <ComboboxList>
                {(group: (typeof engineGroups)[number]) => (
                  <ComboboxGroup key={group.label} items={group.items}>
                    <ComboboxLabel>{group.label}</ComboboxLabel>
                    <ComboboxCollection>
                      {(item: Engine) => (
                        <ComboboxItem key={item.label} value={item}>
                          <EngineLabel {...item} />
                        </ComboboxItem>
                      )}
                    </ComboboxCollection>
                  </ComboboxGroup>
                )}
              </ComboboxList>
              <ComboboxEmpty>No engines found.</ComboboxEmpty>
            </ComboboxContent>
          </Combobox>
        </field.Field>
      )}
    </form.AppField>
  )
}
