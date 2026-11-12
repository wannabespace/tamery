import { TagsIcon } from '@hugeicons/core-free-icons'
import { matchesSearch, sameList } from '@tamery/shared/utils'
import { Badge } from '@tamery/ui/components/badge'
import { MotionCollapse } from '@tamery/ui/components/collapse.motion'
import type { EditableListItem } from '@tamery/ui/components/custom/editable-list'
import { EditableList } from '@tamery/ui/components/custom/editable-list'
import { HighlightText } from '@tamery/ui/components/custom/highlight'
import { FieldDescription } from '@tamery/ui/components/field'
import {
  fieldErrorMessage,
  useAppForm,
} from '@tamery/ui/components/tanstack-form'
import { useSelector } from '@tanstack/react-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { type } from 'arktype'
import { AnimatePresence } from 'motion/react'
import { toast } from 'sonner'

import type { ConnectionResource } from '~/core/connection/sync'
import { alterEnumQuery } from '~/core/queries/enums/alter'
import { createEnumQuery } from '~/core/queries/enums/create'
import { enumDependentsQueryOptions } from '~/core/queries/enums/dependents'
import { dropEnumQuery } from '~/core/queries/enums/drop'
import type { enumType } from '~/core/queries/enums/list'
import { resourceEnumsQueryOptions } from '~/core/queries/enums/list'
import { recreateEnumQuery } from '~/core/queries/enums/recreate'
import { resourceColumnsQueryKey } from '~/core/queries/tables/columns'
import { queryClient } from '~/lib/query-client'

import { SchemaField, TextField } from '../components/fields'
import type {
  InspectorWarning,
  SectionInspectorProps,
} from '../components/inspector'
import { Inspector, InspectorSection } from '../components/inspector'
import { DefinitionsPage } from '../components/page'
import type { RunQuery } from '../hooks/use-definitions-state'
import { useDefinitionsState } from '../hooks/use-definitions-state'
import type { DefinitionsColumn } from '../lib/columns'
import { nameColumn } from '../lib/columns'

type EnumItem = typeof enumType.infer

const REMOVED_VALUE_IN_USE =
  /invalid input value for enum .+?: "(?<value>[^"]*)"/iu

const enumPlan = (item: EnumItem | null, drafts: EditableListItem[]) => {
  const original = item?.values ?? []
  const rows = drafts
    .map((draft) => ({ index: Number(draft.id), value: draft.value.trim() }))
    .filter((row) => row.value)
  const renames: Record<string, string> = {}

  for (const { index, value } of rows) {
    const before = original[index]

    if (before !== undefined && before !== value) {
      renames[before] = value
    }
  }

  return {
    additions: rows
      .filter((row) => original[row.index] === undefined)
      .map((row) => row.value),
    recreate:
      Object.values(renames).some((value) => original.includes(value)) ||
      !original.every((_, index) => rows[index]?.index === index),
    renames,
    values: rows.map((row) => row.value),
  }
}

const enumSchema = type({
  drafts: type({ id: 'string', value: 'string' })
    .array()
    .narrow((drafts, ctx) => {
      const values = drafts.map((draft) => draft.value.trim()).filter(Boolean)

      if (values.length === 0) {
        return ctx.reject({ message: 'Add at least one value.' })
      }

      return (
        new Set(values).size === values.length ||
        ctx.reject({ message: 'Every value has to be different.' })
      )
    }),
  name: type(/\S/u).configure({ message: 'Give the enum a name.' }),
  schema: 'string',
})

type EnumDraft = typeof enumSchema.infer

const refreshColumns = (connectionResource: ConnectionResource) =>
  queryClient.invalidateQueries({
    queryKey: resourceColumnsQueryKey({ connectionResource }),
  })

const saveEnum = async ({
  connectionResource,
  draft,
  item,
  run,
}: {
  connectionResource: ConnectionResource
  draft: EnumDraft
  item: EnumItem | null
  run: RunQuery
}) => {
  const plan = enumPlan(item, draft.drafts)
  const name = draft.name.trim()

  if (!item) {
    await run(
      createEnumQuery({ name, schema: draft.schema, values: plan.values })
    )
    return
  }
  if (plan.recreate) {
    const dependents = await queryClient.query(
      enumDependentsQueryOptions({
        connectionResource,
        name: item.name,
        schema: item.schema,
      })
    )

    await run(
      recreateEnumQuery({
        dependents,
        name: item.name,
        newName: name,
        renames: plan.renames,
        schema: item.schema,
        values: plan.values,
      })
    ).catch((error: Error) => {
      const value = error.message.match(REMOVED_VALUE_IN_USE)?.groups?.value

      throw value === undefined
        ? error
        : new Error(
            `Rows still hold "${value}". Change them to another value first, or keep "${value}" in the list.`
          )
    })
    return
  }

  await run(
    alterEnumQuery({
      additions: plan.additions,
      name: item.name,
      newName: name,
      renames: plan.renames,
      schema: item.schema,
    })
  )
}

const replaceWarning = (item: EnumItem): InspectorWarning => ({
  action: 'Replace enum',
  description: (
    <>
      Postgres can only append to an enum, so we recreate{' '}
      <span data-mask className="font-medium">
        {item.name}
      </span>{' '}
      and repoint its columns. A row holding a dropped value, or a view built on
      the type, rolls it back.
    </>
  ),
})

const valuesNote = ({
  item,
  readOnly,
  recreating,
}: {
  item: EnumItem | null
  readOnly: boolean
  recreating: boolean
}) => {
  if (!item || readOnly || recreating) {
    return null
  }
  return 'Renaming and appending values alter the type in place.'
}

const EnumInspector = ({
  can,
  connectionResource,
  item,
  onOpenChange,
  queryKey,
  run,
  schemas,
  selectedSchema,
}: SectionInspectorProps<EnumItem>) => {
  const mutation = useMutation({
    meta: { event: 'enum_saved' },
    mutationFn: async (draft: EnumDraft) => {
      await saveEnum({ connectionResource, draft, item, run })
      await refreshColumns(connectionResource)
    },
    onSuccess: async (_result, draft) => {
      await queryClient.invalidateQueries({ queryKey })
      toast.success(`Enum "${draft.name.trim()}" ${item ? 'saved' : 'created'}`)
      onOpenChange(false)
    },
  })
  const form = useAppForm({
    defaultValues: {
      drafts: (item?.values.length ? item.values : ['']).map(
        (value, index) => ({ id: String(index), value })
      ),
      name: item?.name ?? '',
      schema: item?.schema ?? selectedSchema ?? '',
    } satisfies EnumDraft,
    onSubmit: ({ value }) => {
      mutation.mutate(value)
    },
    validators: { onChange: enumSchema, onMount: enumSchema },
  })
  const draft = useSelector(form.store, (state) => state.values)

  const readOnly = item ? !can.edit : !can.create
  const { recreate, values } = enumPlan(item, draft.drafts)
  const changed =
    !item || draft.name.trim() !== item.name || !sameList(values, item.values)
  const note = valuesNote({ item, readOnly, recreating: recreate })

  return (
    <Inspector
      canSave={changed}
      description={item?.schema ?? draft.schema}
      form={form}
      item={item}
      mutation={mutation}
      noun="enum"
      readOnly={readOnly}
      warning={item && recreate ? replaceWarning(item) : undefined}
    >
      <InspectorSection
        title="General"
        description="An enum limits a column to a fixed list of values."
      >
        <form.AppField name="schema">
          {() => (
            <SchemaField disabled={readOnly || !!item} schemas={schemas} />
          )}
        </form.AppField>
        <form.AppField name="name">
          {() => (
            <TextField
              label="Name"
              autoFocus={!item}
              description="Recommended to use lowercase and an underscore to separate words."
              disabled={readOnly}
            />
          )}
        </form.AppField>
      </InspectorSection>
      <InspectorSection
        title="Values"
        description="Every value a column of this type may hold, in order."
      >
        <form.AppField name="drafts">
          {(field) => (
            <field.Field>
              <EditableList
                addLabel="Add value"
                error={fieldErrorMessage(field)}
                items={field.state.value}
                placeholder="Value"
                readOnly={readOnly}
                onBlur={field.handleBlur}
                onItemsChange={field.handleChange}
              />
              <AnimatePresence initial={false}>
                {note && (
                  <MotionCollapse key={note}>
                    <FieldDescription>{note}</FieldDescription>
                  </MotionCollapse>
                )}
              </AnimatePresence>
            </field.Field>
          )}
        </form.AppField>
      </InspectorSection>
    </Inspector>
  )
}

const columns: DefinitionsColumn<EnumItem>[] = [
  nameColumn({ icon: () => TagsIcon, width: '3/12' }),
  {
    cell: (item, { search }) => (
      <span data-mask className="flex flex-wrap items-center gap-1">
        {item.values.map((value) => (
          <Badge key={value} size="sm" variant="outline">
            <HighlightText text={value} match={search} />
          </Badge>
        ))}
      </span>
    ),
    header: 'Values',
  },
]

export const Enums = () => {
  const state = useDefinitionsState({ section: 'enums' })
  const { connectionResource, run, search, selectedSchema } = state
  const query = resourceEnumsQueryOptions({ connectionResource })
  const { data: enums = [], isPending } = useQuery(query)

  return (
    <DefinitionsPage
      columns={columns}
      dropItem={async (item, cascade) => {
        await run(
          dropEnumQuery({ cascade, name: item.name, schema: item.schema })
        )
        await refreshColumns(connectionResource)
      }}
      Inspector={EnumInspector}
      items={enums.filter((item) => item.schema === selectedSchema)}
      getKey={(item) => JSON.stringify([item.schema, item.name])}
      loading={isPending}
      match={(item) => matchesSearch(search, item.name, ...item.values)}
      queryKey={query.queryKey}
      state={state}
    />
  )
}
