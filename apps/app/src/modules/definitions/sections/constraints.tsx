import {
  CheckmarkSquare02Icon,
  Key01Icon,
  Link01Icon,
} from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import { matchesSearch, pushUnique, sameList } from '@tamery/shared/utils'
import { HighlightText } from '@tamery/ui/components/custom/highlight'
import { FieldDescription } from '@tamery/ui/components/field'
import { useAppForm } from '@tamery/ui/components/tanstack-form'
import { useSelector } from '@tanstack/react-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { type } from 'arktype'
import { toast } from 'sonner'

import { getCapabilities } from '~/core/catalog/capabilities'
import { submittedName, suggestedName } from '~/core/catalog/engine-name'
import { groupInSchema } from '~/core/connection/utils'
import { createConstraintQuery } from '~/core/queries/constraints/create'
import { dropConstraintQuery } from '~/core/queries/constraints/drop'
import type { constraintsType } from '~/core/queries/constraints/list'
import { resourceConstraintsQueryOptions } from '~/core/queries/constraints/list'
import { recreateConstraintQuery } from '~/core/queries/constraints/recreate'
import { renameConstraintQuery } from '~/core/queries/constraints/rename'
import type {
  ConstraintKind,
  ConstraintShape,
  ReferentialAction,
} from '~/core/queries/constraints/shape'
import { REFERENTIAL_ACTIONS } from '~/core/queries/constraints/shape'
import { structureQueryKey } from '~/core/queries/indexes/list'
import { resourceTableColumnIdsQueryOptions } from '~/core/queries/tables/columns'
import { queryClient } from '~/lib/query-client'

import {
  Labelled,
  OptionSelect,
  OptionsField,
  resetFields,
  SchemaField,
  SelectField,
  SqlField,
  TextField,
} from '../components/fields'
import type {
  InspectorWarning,
  SectionInspectorProps,
} from '../components/inspector'
import {
  InspectorDefinition,
  Inspector,
  InspectorSection,
} from '../components/inspector'
import { DefinitionsPage } from '../components/page'
import { useDefinitionsState } from '../hooks/use-definitions-state'
import { useFilter } from '../hooks/use-filter'
import type { DefinitionsColumn } from '../lib/columns'
import { labelColumn, nameColumn, textColumn } from '../lib/columns'

type ConstraintItem = typeof constraintsType.infer

interface GroupedConstraint extends Omit<
  ConstraintItem,
  'column' | 'foreignColumn'
> {
  columns: string[]
  foreignColumns: string[]
}

interface ConstraintDraft {
  columns: string[]
  expression: string
  foreignColumns: string[]
  foreignSchema: string
  foreignTable: string
  kind: ConstraintKind
  name: string
  onDelete: ReferentialAction
  onUpdate: ReferentialAction
  schema: string
  table: string
}

const typeLabels: Record<ConstraintKind, string> = {
  check: 'Check',
  foreignKey: 'Foreign key',
  primaryKey: 'Primary key',
  unique: 'Unique',
}

const typeIcons: Partial<Record<ConstraintKind, IconSvgElement>> = {
  check: CheckmarkSquare02Icon,
  foreignKey: Link01Icon,
}

const nameSuffix: Record<ConstraintKind, string> = {
  check: 'check',
  foreignKey: 'fkey',
  primaryKey: 'pkey',
  unique: 'key',
}

const DEFAULT_ACTION: ReferentialAction = 'NO ACTION'

// Sync with definitionKey.index: a constraint-owned index links straight to its row.
const constraintKey = (item: Pick<ConstraintItem, 'name' | 'table'>) =>
  JSON.stringify([item.table, item.name])

const noColumns: readonly string[] = []

const groupConstraints = (
  constraints: ConstraintItem[],
  schema: string | undefined
) =>
  groupInSchema(constraints, schema, {
    key: constraintKey,
    merge: (group: GroupedConstraint, item) => {
      pushUnique(group.columns, item.column)
      pushUnique(group.foreignColumns, item.foreignColumn)
    },
    seed: (item): GroupedConstraint => ({
      ...item,
      columns: [],
      foreignColumns: [],
    }),
  })

const getReference = (item: GroupedConstraint, schema: string | undefined) => {
  const table =
    item.foreignSchema && item.foreignSchema !== schema
      ? `${item.foreignSchema}.${item.foreignTable}`
      : item.foreignTable

  return `${table} (${item.foreignColumns.join(', ')})`
}

const asAction = (value: string | null | undefined): ReferentialAction =>
  REFERENTIAL_ACTIONS.find((action) => action === value) ?? DEFAULT_ACTION

const newDraft = (schema: string, kind: ConstraintKind): ConstraintDraft => ({
  columns: [],
  expression: '',
  foreignColumns: [],
  foreignSchema: schema,
  foreignTable: '',
  kind,
  name: '',
  onDelete: DEFAULT_ACTION,
  onUpdate: DEFAULT_ACTION,
  schema,
  table: '',
})

const getDraft = (item: GroupedConstraint): ConstraintDraft => ({
  columns: item.columns,
  expression: item.expression ?? '',
  foreignColumns: item.foreignColumns,
  foreignSchema: item.foreignSchema ?? item.schema,
  foreignTable: item.foreignTable ?? '',
  kind: item.type,
  name: item.name,
  onDelete: asAction(item.onDelete),
  onUpdate: asAction(item.onUpdate),
  schema: item.schema,
  table: item.table,
})

const getSuggestedName = (draft: ConstraintDraft, dialect: Dialect) =>
  suggestedName(dialect, [
    draft.table,
    ...draft.columns,
    nameSuffix[draft.kind],
  ])

const getFinalName = (
  draft: ConstraintDraft,
  dialect: Dialect,
  item: GroupedConstraint | null
) =>
  submittedName(dialect, draft.name, item) || getSuggestedName(draft, dialect)

const getFixedName = (draft: ConstraintDraft, dialect: Dialect) =>
  getCapabilities(dialect).fixedConstraintNames[draft.kind]

const getChange = (
  draft: ConstraintDraft,
  item: GroupedConstraint | null,
  dialect: Dialect
) => {
  const opened = item && getDraft(item)
  const reshaped =
    !!opened &&
    (draft.kind !== opened.kind ||
      !sameList(draft.columns, opened.columns) ||
      (draft.kind === 'check' &&
        draft.expression.trim() !== opened.expression) ||
      draft.foreignSchema !== opened.foreignSchema ||
      draft.foreignTable !== opened.foreignTable ||
      !sameList(draft.foreignColumns, opened.foreignColumns) ||
      draft.onDelete !== opened.onDelete ||
      draft.onUpdate !== opened.onUpdate)
  const renameOnly =
    !!opened && !reshaped && getFinalName(draft, dialect, item) !== opened.name

  return {
    recreates:
      reshaped ||
      (renameOnly &&
        !getCapabilities(dialect).flags.includes('renameConstraints')),
    renameOnly,
    reshaped,
  }
}

const constraintSchema = type({
  columns: 'string[]',
  expression: 'string',
  foreignColumns: 'string[]',
  foreignTable: 'string',
  kind: 'string',
  table: type(/\S/u).configure({
    message: 'Pick the table to constrain.',
  }),
}).narrow((draft, ctx) => {
  if (draft.kind === 'check') {
    return (
      /\S/u.test(draft.expression) ||
      ctx.reject({
        message: 'Write the condition every row must meet.',
        relativePath: ['expression'],
      })
    )
  }

  if (draft.columns.length === 0) {
    return ctx.reject({
      message: 'Pick at least one column.',
      relativePath: ['columns'],
    })
  }

  if (draft.kind !== 'foreignKey') {
    return true
  }

  if (draft.foreignTable === '') {
    return ctx.reject({
      message: 'Pick the table this key points at.',
      relativePath: ['foreignTable'],
    })
  }

  return (
    draft.foreignColumns.length === draft.columns.length ||
    ctx.reject({
      message: 'Reference one column per column of this constraint.',
      relativePath: ['foreignColumns'],
    })
  )
})

const recreateWarning = (
  item: GroupedConstraint,
  renameOnly: boolean
): InspectorWarning => ({
  action: 'Recreate constraint',
  description: renameOnly ? (
    <>
      No rename in place here, so we drop{' '}
      <span data-mask className="font-medium">
        {item.name}
      </span>{' '}
      and add it back renamed in one statement.
    </>
  ) : (
    <>
      We drop{' '}
      <span data-mask className="font-medium">
        {item.name}
      </span>{' '}
      and add it back reshaped. A row breaking the new rule fails the add.
    </>
  ),
})

const ConstraintInspector = ({
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
}: SectionInspectorProps<GroupedConstraint>) => {
  const kinds = getCapabilities(dialect).constraintKinds
  const mutation = useMutation({
    meta: { event: 'constraint_saved' },
    mutationFn: (draft: ConstraintDraft) => {
      const shape: ConstraintShape = {
        columns: draft.columns,
        expression: draft.expression.trim(),
        foreignColumns: draft.foreignColumns,
        foreignSchema: draft.foreignSchema,
        foreignTable: draft.foreignTable,
        kind: draft.kind,
        name: getFinalName(draft, dialect, item),
        onDelete: draft.onDelete,
        onUpdate: draft.onUpdate,
      }

      if (!item) {
        return run(
          createConstraintQuery({
            schema: draft.schema,
            shape,
            table: draft.table,
          })
        )
      }
      const target = { name: item.name, schema: item.schema, table: item.table }

      return run(
        getChange(draft, item, dialect).recreates
          ? recreateConstraintQuery({ ...target, kind: item.type, shape })
          : renameConstraintQuery({ ...target, newName: shape.name })
      )
    },
    onSuccess: async (_result, draft) => {
      await queryClient.invalidateQueries({ queryKey })
      toast.success(
        `Constraint "${getFixedName(draft, dialect) ?? getFinalName(draft, dialect, item)}" ${item ? 'saved' : 'created'}`
      )
      onOpenChange(false)
    },
  })
  const form = useAppForm({
    defaultValues: item
      ? getDraft(item)
      : newDraft(selectedSchema ?? '', kinds[0] ?? 'unique'),
    onSubmit: ({ value }) => {
      mutation.mutate(value)
    },
    validators: { onChange: constraintSchema, onMount: constraintSchema },
  })
  const draft = useSelector(form.store, (state) => state.values)
  const { data: tableColumns } = useQuery({
    ...resourceTableColumnIdsQueryOptions({
      connectionResource,
      schema: draft.schema,
      table: draft.table,
    }),
    enabled: draft.table !== '',
  })
  const { data: foreignColumns } = useQuery({
    ...resourceTableColumnIdsQueryOptions({
      connectionResource,
      schema: draft.foreignSchema,
      table: draft.foreignTable,
    }),
    enabled: draft.foreignTable !== '',
  })

  const readOnly = item ? !can.edit || !kinds.includes(item.type) : !can.create
  const shapeLocked = readOnly || !!item?.custom
  const { recreates, renameOnly, reshaped } = getChange(draft, item, dialect)
  const singleColumn = draft.columns.length === 1

  return (
    <Inspector
      canSave={!item || reshaped || renameOnly}
      description={item ? `${item.schema}.${item.table}` : draft.schema}
      form={form}
      item={item}
      mutation={mutation}
      noun="constraint"
      readOnly={readOnly}
      warning={
        item && recreates ? recreateWarning(item, renameOnly) : undefined
      }
    >
      <InspectorSection
        title="General"
        description="A constraint is a rule the database enforces on every write."
      >
        <form.AppField name="schema">
          {() => (
            <SchemaField
              disabled={readOnly || !!item}
              schemas={schemas}
              onChanged={(next) =>
                resetFields(form, {
                  columns: [],
                  foreignColumns: [],
                  foreignSchema: next,
                  foreignTable: '',
                  table: '',
                })
              }
            />
          )}
        </form.AppField>
        <form.AppField name="name">
          {() => (
            <TextField
              label="Name"
              autoFocus
              description="Leave it empty to use the suggested name."
              disabled={readOnly || !!getFixedName(draft, dialect)}
              placeholder={
                getFixedName(draft, dialect) ??
                (draft.table
                  ? getSuggestedName(draft, dialect)
                  : 'Constraint name')
              }
            />
          )}
        </form.AppField>
        <form.AppField name="kind">
          {() => (
            <SelectField
              label="Type"
              description="A primary key identifies a row, unique rejects duplicates, a foreign key points at another table, a check holds every row to a condition."
              disabled={shapeLocked}
              options={kinds}
              getLabel={(value) => typeLabels[value]}
              placeholder="Type"
            />
          )}
        </form.AppField>
      </InspectorSection>
      <InspectorSection
        title="Target"
        description="The table and the columns this constraint applies to."
      >
        <form.AppField name="table">
          {() => (
            <SelectField
              label="Table"
              disabled={readOnly || !!item}
              options={
                item ? [item.table] : getRelationNames(draft.schema, 'table')
              }
              placeholder="Choose a table"
              onChanged={() => resetFields(form, { columns: [] })}
            />
          )}
        </form.AppField>
        {draft.kind === 'check' ? (
          <form.AppField name="expression">
            {() => (
              <SqlField
                label="Condition"
                description="SQL every row must make true."
                disabled={shapeLocked}
                placeholder="price > 0"
              />
            )}
          </form.AppField>
        ) : (
          <form.AppField name="columns">
            {() => (
              <OptionsField
                label="Columns"
                disabled={shapeLocked || draft.table === ''}
                options={tableColumns}
                placeholder="Choose columns"
              />
            )}
          </form.AppField>
        )}
        {item?.custom && (
          <FieldDescription>
            Carries a rule the form cannot show (deferrable, not validated, not
            inherited, disabled or a match type), so only its name can change.
          </FieldDescription>
        )}
      </InspectorSection>
      {draft.kind === 'foreignKey' && (
        <InspectorSection
          title="References"
          description="The rows this key points at, and what happens when one of them changes."
        >
          <form.AppField name="foreignSchema">
            {() => (
              <SchemaField
                disabled={shapeLocked}
                schemas={schemas}
                onChanged={() =>
                  resetFields(form, {
                    foreignColumns: [],
                    foreignTable: '',
                  })
                }
              />
            )}
          </form.AppField>
          <form.AppField name="foreignTable">
            {() => (
              <SelectField
                label="Table"
                disabled={shapeLocked}
                options={getRelationNames(draft.foreignSchema, 'table')}
                placeholder="Choose a table"
                onChanged={() => resetFields(form, { foreignColumns: [] })}
              />
            )}
          </form.AppField>
          <form.AppField name="foreignColumns">
            {(field) =>
              singleColumn ? (
                <Labelled
                  label="Column"
                  description="The column this key points at."
                >
                  <OptionSelect
                    id={field.name}
                    disabled={shapeLocked || draft.foreignTable === ''}
                    options={foreignColumns ?? noColumns}
                    placeholder="Choose a column"
                    value={field.state.value[0] ?? ''}
                    onValueChange={(next) => field.handleChange([next])}
                  />
                </Labelled>
              ) : (
                <OptionsField
                  label="Columns"
                  description={`${draft.columns.length} referenced columns, one per column of this constraint, in the same order.`}
                  disabled={
                    shapeLocked ||
                    draft.foreignTable === '' ||
                    draft.columns.length === 0
                  }
                  limit={draft.columns.length}
                  options={foreignColumns}
                  placeholder="Choose columns"
                />
              )
            }
          </form.AppField>
          <div className="grid grid-cols-2 gap-3">
            <form.AppField name="onDelete">
              {() => (
                <SelectField
                  label="On delete"
                  disabled={shapeLocked}
                  options={getCapabilities(dialect).referentialActions}
                  placeholder="Action"
                />
              )}
            </form.AppField>
            {getCapabilities(dialect).flags.includes('foreignKeyOnUpdate') && (
              <form.AppField name="onUpdate">
                {() => (
                  <SelectField
                    label="On update"
                    disabled={shapeLocked}
                    options={getCapabilities(dialect).referentialActions}
                    placeholder="Action"
                  />
                )}
              </form.AppField>
            )}
          </div>
          <FieldDescription>
            What the database does to these rows when a referenced row is
            deleted or its key is updated.
          </FieldDescription>
        </InspectorSection>
      )}
      {item?.definition && <InspectorDefinition code={item.definition} />}
    </Inspector>
  )
}

const columns: DefinitionsColumn<GroupedConstraint>[] = [
  nameColumn({
    icon: (item: GroupedConstraint) => typeIcons[item.type] ?? Key01Icon,
    width: '4/12',
  }),
  textColumn({
    header: 'Table',
    valueOf: (item: GroupedConstraint) => item.table,
    width: '2/12',
  }),
  {
    cell: (item, { schema, search }) => (
      <span data-mask>
        <HighlightText
          text={item.expression ?? item.columns.join(', ')}
          match={search}
        />
        {item.foreignTable && (
          <span className="text-muted-foreground">
            {' → '}
            <HighlightText text={getReference(item, schema)} match={search} />
          </span>
        )}
      </span>
    ),
    header: 'Columns',
  },
  labelColumn({
    align: 'end',
    getLabel: (item: GroupedConstraint) => typeLabels[item.type],
    header: 'Type',
    width: '2/12',
  }),
]

export const Constraints = () => {
  const state = useDefinitionsState({ section: 'constraints' })
  const { connectionResource, getRelationNames, run, search, selectedSchema } =
    state
  const query = resourceConstraintsQueryOptions({ connectionResource })
  const { data: constraints = [], isPending } = useQuery(query)
  const kindFilter = useFilter<ConstraintKind>('All types', [
    { label: 'Primary keys', value: 'primaryKey' },
    { label: 'Foreign keys', value: 'foreignKey' },
    { label: 'Unique', value: 'unique' },
    { label: 'Checks', value: 'check' },
  ])

  const inSchema = groupConstraints(constraints, selectedSchema)
  const matches = (item: GroupedConstraint) =>
    kindFilter.matches(item.type) &&
    matchesSearch(
      search,
      item.name,
      item.table,
      item.foreignTable,
      item.expression,
      ...item.columns
    )
  const dropItem = (item: GroupedConstraint, cascade: boolean) =>
    run(
      dropConstraintQuery({
        cascade,
        kind: item.type,
        name: item.name,
        schema: item.schema,
        table: item.table,
      })
    )

  return (
    <DefinitionsPage
      columns={columns}
      createBlocked={
        getRelationNames(selectedSchema ?? '', 'table').length === 0
          ? 'This schema has no tables to constrain.'
          : undefined
      }
      canDropItem={(item) =>
        getCapabilities(state.dialect).constraintKinds.includes(item.type)
      }
      dropItem={dropItem}
      Inspector={ConstraintInspector}
      items={inSchema}
      getKey={constraintKey}
      loading={isPending}
      match={matches}
      queryKey={structureQueryKey(connectionResource)}
      state={state}
      toolbar={kindFilter.control}
    />
  )
}
