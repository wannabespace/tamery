import { useAppForm } from '@tamery/ui/components/tanstack-form'
import { useSelector } from '@tanstack/react-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { type } from 'arktype'
import { toast } from 'sonner'

import { createIndexQuery } from '~/core/queries/indexes/create'
import { resourceTableColumnIdsQueryOptions } from '~/core/queries/tables/columns'
import { queryClient } from '~/lib/query-client'

import {
  OptionsField,
  resetFields,
  SelectField,
  SwitchField,
  TextField,
} from '../components/fields'
import type { SectionInspectorProps } from '../components/inspector'
import {
  Inspector,
  InspectorDefinition,
  InspectorSection,
} from '../components/inspector'
import type { GroupedIndex } from './indexes'

interface MongoIndexDraft {
  expireAfterSeconds: string
  fields: string[]
  name: string
  sparse: boolean
  table: string
  unique: boolean
}

const getDraft = (item: GroupedIndex | null): MongoIndexDraft => ({
  expireAfterSeconds: '',
  fields: item?.columns ?? [],
  name: item?.name ?? '',
  sparse: false,
  table: item?.table ?? '',
  unique: item ? item.kind !== 'regular' : false,
})

const mongoIndexSchema = type({
  fields: type('string[] >= 1').configure({
    message: 'Pick at least one field.',
  }),
  // Blank keeps a non-expiring index; a positive whole number makes it a TTL index.
  expireAfterSeconds: type(/^(?:[1-9]\d*)?$/u).configure({
    message: 'Use a whole number of seconds, or leave it empty.',
  }),
  table: type(/\S/u).configure({
    message: 'Pick the collection to index.',
  }),
})

const saveIndex = (
  draft: MongoIndexDraft,
  run: SectionInspectorProps<GroupedIndex>['run']
) =>
  run(
    createIndexQuery({
      columns: draft.fields,
      expireAfterSeconds: draft.expireAfterSeconds.trim()
        ? Number(draft.expireAfterSeconds)
        : undefined,
      name: draft.name.trim(),
      schema: '',
      sparse: draft.sparse,
      table: draft.table,
      unique: draft.unique,
    })
  )

export const MongoIndexInspector = ({
  connectionResource,
  getRelationNames,
  item,
  onOpenChange,
  queryKey,
  run,
  selectedSchema,
}: SectionInspectorProps<GroupedIndex>) => {
  const mutation = useMutation({
    meta: { event: 'index_saved' },
    mutationFn: (draft: MongoIndexDraft) => saveIndex(draft, run),
    onSuccess: async (_result, draft) => {
      await queryClient.invalidateQueries({ queryKey })
      toast.success(
        `Index "${draft.name.trim() || draft.fields.join('_')}" saved`
      )
      onOpenChange(false)
    },
  })
  const form = useAppForm({
    defaultValues: getDraft(item),
    onSubmit: ({ value }) => mutation.mutate(value),
    validators: { onChange: mongoIndexSchema, onMount: mongoIndexSchema },
  })
  const draft = useSelector(form.store, (state) => state.values)
  const { data: fieldNames } = useQuery({
    ...resourceTableColumnIdsQueryOptions({
      connectionResource,
      schema: selectedSchema ?? '',
      table: draft.table,
    }),
    enabled: draft.table !== '',
  })

  // An existing index cannot be altered in MongoDB, only dropped, so it opens read-only.
  const readOnly = !!item

  return (
    <Inspector
      canSave={!item}
      description={item ? item.table : (selectedSchema ?? '')}
      form={form}
      item={item}
      mutation={mutation}
      noun="index"
      readOnly={readOnly}
    >
      <InspectorSection
        title="General"
        description="An index speeds up lookups on the fields it covers."
      >
        <form.AppField name="name">
          {() => (
            <TextField
              label="Name"
              autoFocus
              description="Leave it empty to use MongoDB's generated name."
              disabled={readOnly}
              placeholder={
                draft.fields.length > 0 ? draft.fields.join('_') : 'Index name'
              }
            />
          )}
        </form.AppField>
      </InspectorSection>
      <InspectorSection
        title="Keys"
        description="The collection and the fields this index covers, in order."
      >
        <form.AppField name="table">
          {() => (
            <SelectField
              label="Collection"
              disabled={readOnly || !!item}
              options={
                item
                  ? [item.table]
                  : getRelationNames(selectedSchema ?? '', 'table')
              }
              placeholder="Choose a collection"
              onChanged={() => resetFields(form, { fields: [] })}
            />
          )}
        </form.AppField>
        <form.AppField name="fields">
          {() => (
            <OptionsField
              label="Fields"
              description="A query uses the index when it filters on the leading fields."
              disabled={readOnly || draft.table === ''}
              options={fieldNames}
              placeholder="Choose fields"
            />
          )}
        </form.AppField>
      </InspectorSection>
      {!item && (
        <InspectorSection title="Options">
          <form.AppField name="unique">
            {() => (
              <SwitchField
                title="Unique"
                description="Rejects documents repeating a value across the chosen fields."
                disabled={readOnly}
              />
            )}
          </form.AppField>
          <form.AppField name="sparse">
            {() => (
              <SwitchField
                title="Sparse"
                description="Indexes only documents that have the chosen fields."
                disabled={readOnly}
              />
            )}
          </form.AppField>
          <form.AppField name="expireAfterSeconds">
            {() => (
              <TextField
                label="Expire after (seconds)"
                description="A TTL index removes a document this long after its indexed date. Leave empty to keep documents."
                disabled={readOnly}
                inputMode="numeric"
                placeholder="Never"
              />
            )}
          </form.AppField>
        </InspectorSection>
      )}
      {item?.definition && <InspectorDefinition code={item.definition} />}
    </Inspector>
  )
}
