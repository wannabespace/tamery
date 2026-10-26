import { LABEL_OPTIONS } from '@tamery/shared/constants'
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@tamery/ui/components/combobox'
import { useLiveQuery } from '@tanstack/react-db'
import { useState } from 'react'

import { useCollections } from '~/core/collections'
import { workspaceConnections } from '~/core/connection/workspace-scope'
import { useActiveWorkspace } from '~/core/workspace/hooks'

import type { ConnectionForm } from '../lib/connection-form'

const NO_LABEL = ''

export const LabelField = ({ form }: { form: ConnectionForm }) => {
  const { connectionsCollection } = useCollections()
  const { data: activeWorkspace } = useActiveWorkspace()
  const { data: connections } = useLiveQuery({
    query: (q) =>
      workspaceConnections(q, connectionsCollection, activeWorkspace),
  })
  const [query, setQuery] = useState('')
  const labels = [
    ...new Set([
      ...LABEL_OPTIONS,
      ...connections.flatMap((connection) =>
        connection.label ? [connection.label] : []
      ),
    ]),
  ]
  const created = query.trim()
  const canCreate =
    created !== '' &&
    !labels.some((label) => label.toLowerCase() === created.toLowerCase())

  return (
    <form.AppField name="label">
      {(field) => (
        <field.Field orientation="row">
          <field.Label>Label</field.Label>
          <Combobox
            items={[NO_LABEL, ...labels, ...(canCreate ? [created] : [])]}
            value={field.state.value}
            onValueChange={(next) => field.handleChange(next ?? NO_LABEL)}
            inputValue={query}
            onInputValueChange={setQuery}
            autoHighlight
          >
            <ComboboxTrigger id={field.name} variant="flat" className="flex-1">
              <span data-mask className="truncate">
                <ComboboxValue>
                  {(value: string) =>
                    value || <span className="text-muted-foreground">None</span>
                  }
                </ComboboxValue>
              </span>
            </ComboboxTrigger>
            <ComboboxContent className="min-w-(--anchor-width)">
              <ComboboxInput
                showTrigger={false}
                placeholder="Search or create…"
                autoComplete="off"
                data-mask
              />
              <ComboboxList>
                {(item: string) => (
                  <ComboboxItem key={item} value={item} data-mask>
                    {item === NO_LABEL && 'None'}
                    {item !== NO_LABEL &&
                      (canCreate && item === created
                        ? `Create “${item}”`
                        : item)}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </field.Field>
      )}
    </form.AppField>
  )
}
