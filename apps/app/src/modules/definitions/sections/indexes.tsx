import {
  ArrowRight01Icon,
  LeftToRightListDashIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import { fileSize } from '@tamery/shared/files'
import { matchesSearch, pushUnique, sameList } from '@tamery/shared/utils'
import { Badge } from '@tamery/ui/components/badge'
import { MotionCollapse } from '@tamery/ui/components/collapse.motion'
import { HighlightText } from '@tamery/ui/components/custom/highlight'
import { FieldDescription } from '@tamery/ui/components/field'
import { useAppForm } from '@tamery/ui/components/tanstack-form'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useSelector } from '@tanstack/react-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { type } from 'arktype'
import { AnimatePresence } from 'motion/react'
import { toast } from 'sonner'

import { Link } from '~/components/link'
import type { SectionCapabilities } from '~/core/catalog/capabilities'
import { getCapabilities } from '~/core/catalog/capabilities'
import { definitionKey } from '~/core/catalog/definition-keys'
import { submittedName, suggestedName } from '~/core/catalog/engine-name'
import { useObjectNames } from '~/core/catalog/names'
import { groupInSchema } from '~/core/connection/utils'
import { createIndexQuery } from '~/core/queries/indexes/create'
import { dropIndexQuery } from '~/core/queries/indexes/drop'
import type { indexesType } from '~/core/queries/indexes/list'
import {
  resourceIndexesQueryOptions,
  structureQueryKey,
} from '~/core/queries/indexes/list'
import { recreateIndexQuery } from '~/core/queries/indexes/recreate'
import { renameIndexQuery } from '~/core/queries/indexes/rename'
import { resourceTableColumnIdsQueryOptions } from '~/core/queries/tables/columns'
import { definitionsTabId } from '~/core/tabs/ids'
import { queryClient } from '~/lib/query-client'

import {
  OptionsField,
  SchemaField,
  SearchSelectField,
  SelectField,
  SwitchField,
  TextField,
  resetFields,
} from '../components/fields'
import type { SectionInspectorProps } from '../components/inspector'
import {
  InspectorDefinition,
  Inspector,
  InspectorSection,
} from '../components/inspector'
import { DefinitionsPage } from '../components/page'
import type { RunQuery } from '../hooks/use-definitions-state'
import { useDefinitionsState } from '../hooks/use-definitions-state'
import { useFilter } from '../hooks/use-filter'
import type { DefinitionsColumn } from '../lib/columns'
import { nameColumn, numberColumn } from '../lib/columns'
import { MongoIndexInspector } from './mongo-index-inspector'

type IndexItem = typeof indexesType.infer
type IndexKind = 'primary' | 'unique' | 'regular'

export interface GroupedIndex extends Omit<
  IndexItem,
  'column' | 'customExpression' | 'isPrimary' | 'isUnique'
> {
  columns: string[]
  kind: IndexKind
}

interface IndexDraft {
  columns: string[]
  granularity: string
  name: string
  schema: string
  skipType: string
  table: string
  unique: boolean
}

const kindLabels: Record<IndexKind, string | null> = {
  primary: 'Primary',
  regular: null,
  unique: 'Unique',
}

const scanCount = new Intl.NumberFormat()

const getKind = (item: IndexItem): IndexKind => {
  if (item.isPrimary) {
    return 'primary'
  }

  return item.isUnique ? 'unique' : 'regular'
}

const groupIndexes = (indexes: IndexItem[], schema: string | undefined) =>
  groupInSchema(indexes, schema, {
    key: definitionKey.index,
    merge: (group: GroupedIndex, item) => {
      pushUnique(group.columns, item.column ?? item.customExpression)
      group.custom ||= item.custom
    },
    seed: (item): GroupedIndex => ({
      ...item,
      columns: [],
      kind: getKind(item),
    }),
  })

const getSuggestedName = (draft: IndexDraft, dialect: Dialect) =>
  suggestedName(dialect, [draft.table, ...draft.columns, 'idx'])

const getFinalName = (
  draft: IndexDraft,
  dialect: Dialect,
  item: GroupedIndex | null
) =>
  submittedName(dialect, draft.name, item) || getSuggestedName(draft, dialect)

const getDraft = (
  item: GroupedIndex | null,
  pageSchema: string,
  dialect: Dialect
): IndexDraft => ({
  columns: item?.columns ?? [],
  granularity: String(item?.granularity ?? 1),
  name: item?.name ?? '',
  schema: item?.schema ?? pageSchema,
  skipType: item?.type ?? getCapabilities(dialect).indexes.skipTypes[0] ?? '',
  table: item?.table ?? '',
  unique: item ? item.kind !== 'regular' : false,
})

const reshapes = (
  draft: IndexDraft,
  item: GroupedIndex | null,
  dialect: Dialect
) => {
  if (!item) {
    return false
  }
  const opened = getDraft(item, item.schema, dialect)

  return (
    !sameList(draft.columns, opened.columns) ||
    draft.unique !== opened.unique ||
    draft.skipType !== opened.skipType ||
    draft.granularity !== opened.granularity ||
    (!getCapabilities(dialect).indexes.rename &&
      getFinalName(draft, dialect, item) !== item.name)
  )
}

const saveIndex = ({
  dialect,
  draft,
  item,
  run,
}: {
  dialect: Dialect
  draft: IndexDraft
  item: GroupedIndex | null
  run: RunQuery
}) => {
  const { columns, schema, skipType, table, unique } = draft
  const shape = {
    columns,
    granularity: Number(draft.granularity),
    schema,
    skipType,
    table,
    unique,
  }
  const name = getFinalName(draft, dialect, item)

  if (!item) {
    return run(createIndexQuery({ ...shape, name }))
  }

  const target = { name: item.name, schema: item.schema, table: item.table }

  return run(
    reshapes(draft, item, dialect)
      ? recreateIndexQuery({ ...shape, ...target, newName: name })
      : renameIndexQuery({ ...target, newName: name })
  )
}

const getLocks = ({
  can,
  item,
  dialect,
}: {
  can: SectionCapabilities
  dialect: Dialect
  item: GroupedIndex | null
}) => {
  const owned = !!item?.constraintOwned
  const { flags, indexes } = getCapabilities(dialect)
  const readOnly = item
    ? !can.edit ||
      (owned && !flags.includes('renameConstraints')) ||
      (!!item.custom && !indexes.rename)
    : !can.create

  return { readOnly, shape: readOnly || owned || !!item?.custom }
}

const indexSchema = type({
  columns: type('string[] >= 1').configure({
    message: 'Pick at least one column.',
  }),
  granularity: type(/^[1-9]\d*$/u).configure({
    message: 'Use a whole number of granules, 1 or more.',
  }),
  table: type(/\S/u).configure({ message: 'Pick the table to index.' }),
})

const rebuildWarning = (item: GroupedIndex | null) => ({
  action: 'Rebuild index',
  description: (
    <>
      We drop{' '}
      <span data-mask className="font-medium">
        {item?.name}
      </span>{' '}
      and build it again. Queries run unindexed in between, and duplicate rows
      block a unique rebuild.
    </>
  ),
})

const ColumnNotes = ({
  item,
  onLeave,
  resourceId,
  schema,
}: {
  item: GroupedIndex | null
  onLeave: () => void
  resourceId: string
  schema: string
}) => (
  <AnimatePresence initial={false}>
    {item?.custom && (
      <MotionCollapse key="custom">
        <FieldDescription>
          Built with an expression, method, predicate or ordering the picker
          cannot show, so only its name can change.
        </FieldDescription>
      </MotionCollapse>
    )}
    {item?.constraintOwned && (
      <MotionCollapse key="owned">
        <FieldDescription>
          This index enforces a constraint, which owns its columns.{' '}
          <Link
            to="/connection/$resourceId/$tabId"
            params={{ resourceId, tabId: definitionsTabId('constraints') }}
            search={{ open: definitionKey.index(item), schema }}
            onClick={onLeave}
            className="text-primary font-medium hover:underline"
          >
            Open in Constraints
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              strokeWidth={2}
              className="ml-0.5 inline size-3.5 align-[-2px]"
            />
          </Link>
        </FieldDescription>
      </MotionCollapse>
    )}
  </AnimatePresence>
)

const IndexInspector = ({
  can,
  connectionResource,
  item,
  getRelationNames,
  onOpenChange,
  queryKey,
  run,
  schemas,
  selectedSchema,
  dialect,
}: SectionInspectorProps<GroupedIndex>) => {
  const mutation = useMutation({
    meta: { event: 'index_saved' },
    mutationFn: (draft: IndexDraft) => saveIndex({ dialect, draft, item, run }),
    onSuccess: async (_result, draft) => {
      await queryClient.invalidateQueries({ queryKey })
      toast.success(`Index "${getFinalName(draft, dialect, item)}" saved`)
      onOpenChange(false)
    },
  })
  const form = useAppForm({
    defaultValues: getDraft(item, selectedSchema ?? '', dialect),
    onSubmit: ({ value }) => {
      mutation.mutate(value)
    },
    validators: { onChange: indexSchema, onMount: indexSchema },
  })
  const draft = useSelector(form.store, (state) => state.values)
  const { data: columnNames } = useQuery({
    ...resourceTableColumnIdsQueryOptions({
      connectionResource,
      schema: draft.schema,
      table: draft.table,
    }),
    enabled: draft.table !== '',
  })

  const locked = getLocks({ can, dialect, item })
  const reshaped = reshapes(draft, item, dialect)
  const { skipTypes } = getCapabilities(dialect).indexes

  return (
    <Inspector
      canSave={
        !item || reshaped || getFinalName(draft, dialect, item) !== item.name
      }
      description={item ? `${item.schema}.${item.table}` : draft.schema}
      form={form}
      item={item}
      mutation={mutation}
      noun="index"
      readOnly={locked.readOnly}
      warning={reshaped ? rebuildWarning(item) : undefined}
    >
      <InspectorSection
        title="General"
        description="An index speeds up lookups on the columns it covers."
      >
        <form.AppField name="schema">
          {() => (
            <SchemaField
              disabled={locked.readOnly || !!item}
              schemas={schemas}
              onChanged={() => resetFields(form, { columns: [], table: '' })}
            />
          )}
        </form.AppField>
        <form.AppField name="name">
          {() => (
            <TextField
              label="Name"
              autoFocus
              description="Leave it empty to use the suggested name."
              disabled={locked.readOnly}
              placeholder={
                draft.table ? getSuggestedName(draft, dialect) : 'Index name'
              }
            />
          )}
        </form.AppField>
      </InspectorSection>
      <InspectorSection
        title="Target"
        description="The table and the columns this index covers, in order."
      >
        <form.AppField name="table">
          {() => (
            <SearchSelectField
              label="Table"
              disabled={locked.readOnly || !!item}
              options={
                item ? [item.table] : getRelationNames(draft.schema, 'table')
              }
              placeholder="Choose a table"
              onChanged={() => resetFields(form, { columns: [] })}
            />
          )}
        </form.AppField>
        <form.AppField name="columns">
          {() => (
            <OptionsField
              label="Columns"
              description={
                skipTypes.length > 0
                  ? 'A read skips blocks of rows whose values cannot match a filter on these columns.'
                  : 'A query uses the index when it filters on the leading columns.'
              }
              disabled={locked.shape || draft.table === ''}
              options={columnNames}
              placeholder="Choose columns"
            />
          )}
        </form.AppField>
        <ColumnNotes
          item={item}
          onLeave={() => onOpenChange(false)}
          resourceId={connectionResource.id}
          schema={draft.schema}
        />
      </InspectorSection>
      {skipTypes.length > 0 ? (
        item?.kind !== 'primary' && (
          <InspectorSection
            title="Options"
            description="What the index keeps per block of granules. Existing rows are indexed in the background."
          >
            <div className="grid grid-cols-2 gap-3">
              <form.AppField name="skipType">
                {() => (
                  <SelectField
                    label="Type"
                    disabled={locked.shape}
                    options={skipTypes}
                    placeholder="Type"
                  />
                )}
              </form.AppField>
              <form.AppField name="granularity">
                {() => (
                  <TextField
                    label="Granularity"
                    disabled={locked.shape}
                    inputMode="numeric"
                  />
                )}
              </form.AppField>
            </div>
          </InspectorSection>
        )
      ) : (
        <InspectorSection title="Options">
          <form.AppField name="unique">
            {() => (
              <SwitchField
                title="Unique"
                description="Rejects rows repeating a value across the chosen columns."
                disabled={locked.shape}
              />
            )}
          </form.AppField>
        </InspectorSection>
      )}
      {item?.definition && <InspectorDefinition code={item.definition} />}
    </Inspector>
  )
}

const coveringIndex = (item: GroupedIndex, all: GroupedIndex[]) =>
  item.kind === 'regular' && !item.custom && !item.predicate
    ? all.find(
        (other) =>
          other !== item &&
          other.schema === item.schema &&
          other.table === item.table &&
          other.type === item.type &&
          !other.custom &&
          !other.predicate &&
          item.columns.every(
            (column, index) => other.columns[index] === column
          ) &&
          (other.columns.length > item.columns.length ||
            other.kind !== 'regular' ||
            other.name < item.name)
      )
    : undefined

const StatusBadge = ({ hint, label }: { hint: string; label: string }) => (
  <Tooltip>
    <TooltipTrigger render={<Badge variant="warning" />}>
      {label}
    </TooltipTrigger>
    <TooltipContent>{hint}</TooltipContent>
  </Tooltip>
)

const indexColumns = ({
  all,
  plainTypes,
  stats,
}: {
  all: GroupedIndex[]
  plainTypes: readonly string[]
  stats: boolean
}): DefinitionsColumn<GroupedIndex>[] => [
  nameColumn({
    after: (item) => {
      const kind = kindLabels[item.kind]
      const covering = coveringIndex(item, all)
      return (
        <>
          {kind && <Badge variant="secondary">{kind}</Badge>}
          {covering && (
            <StatusBadge
              label="Redundant"
              hint={`${covering.name} starts with the same columns, so queries can use it instead.`}
            />
          )}
          {item.kind === 'regular' && item.scans === 0 && (
            <StatusBadge
              label="Unused"
              hint="No query has read it since the statistics were last reset."
            />
          )}
        </>
      )
    },
    icon: () => LeftToRightListDashIcon,
    width: '4/12',
  }),
  {
    cell: (item, { search }) => {
      const method =
        item.type && !plainTypes.includes(item.type)
          ? item.type.toLowerCase()
          : null
      return (
        <span className="flex min-w-0 items-baseline gap-2">
          <span data-mask className="truncate font-mono">
            <HighlightText text={item.columns.join(', ')} match={search} />
            {item.included && (
              <span className="text-muted-foreground">
                {' '}
                include ({item.included})
              </span>
            )}
            {item.predicate && (
              <span className="text-muted-foreground">
                {' '}
                where {item.predicate}
              </span>
            )}
          </span>
          {method && (
            <span className="text-muted-foreground shrink-0">{method}</span>
          )}
        </span>
      )
    },
    header: 'Columns',
    sortValue: (item) => item.columns.join(', '),
  },
  ...(stats
    ? [
        numberColumn<GroupedIndex>({
          format: fileSize,
          header: 'Size',
          valueOf: (item) => item.sizeBytes,
          width: '2/12',
        }),
        numberColumn<GroupedIndex>({
          format: (value) => scanCount.format(value),
          header: 'Scans',
          valueOf: (item) => item.scans ?? null,
          width: '2/12',
        }),
      ]
    : []),
]

export const Indexes = () => {
  const state = useDefinitionsState({ section: 'indexes' })
  const {
    connectionResource,
    dialect,
    getRelationNames,
    run,
    search,
    selectedSchema,
  } = state
  const names = useObjectNames()
  const { flags, indexes: indexCapabilities } = getCapabilities(dialect)
  const documentIndexes = flags.includes('documentIndexes')
  const query = resourceIndexesQueryOptions({ connectionResource })
  const { data: indexes = [], isPending } = useQuery(query)
  const kindFilter = useFilter<IndexKind>('All types', [
    { label: 'Primary keys', value: 'primary' },
    { label: 'Unique', value: 'unique' },
    { label: 'Regular', value: 'regular' },
  ])

  const items = groupIndexes(indexes, selectedSchema)

  return (
    <DefinitionsPage
      canDropItem={(item) => !item.constraintOwned && item.name !== '_id_'}
      columns={indexColumns({
        all: items,
        plainTypes: indexCapabilities.plainTypes,
        stats: flags.includes('indexStats'),
      })}
      createBlocked={
        getRelationNames(selectedSchema ?? '', 'table').length === 0
          ? `This schema has no ${names.table}s to index.`
          : undefined
      }
      dropItem={(item) =>
        run(
          dropIndexQuery({
            name: item.name,
            schema: item.schema,
            table: item.table,
          })
        )
      }
      Inspector={documentIndexes ? MongoIndexInspector : IndexInspector}
      items={items}
      getKey={definitionKey.index}
      groupOf={(item) => item.table}
      loading={isPending}
      match={(item) =>
        kindFilter.matches(item.kind) &&
        matchesSearch(
          search,
          item.name,
          item.table,
          ...item.columns,
          item.predicate ?? ''
        )
      }
      queryKey={structureQueryKey(connectionResource)}
      state={state}
      toolbar={kindFilter.control}
    />
  )
}
