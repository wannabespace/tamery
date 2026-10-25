import { SourceCodeIcon } from '@hugeicons/core-free-icons'
import { languageIds } from '@tamery/monaco/query-language'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import { matchesSearch, sameShape } from '@tamery/shared/utils'
import { HighlightText } from '@tamery/ui/components/custom/highlight'
import { useAppForm } from '@tamery/ui/components/tanstack-form'
import { useSelector } from '@tanstack/react-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { type } from 'arktype'
import { toast } from 'sonner'

import { getCapabilities } from '~/core/catalog/capabilities'
import { submittedName } from '~/core/catalog/engine-name'
import { createFunctionQuery } from '~/core/queries/functions/create'
import { functionDefinitionQueryOptions } from '~/core/queries/functions/definition'
import { dropFunctionQuery } from '~/core/queries/functions/drop'
import type { functionsType } from '~/core/queries/functions/list'
import { resourceFunctionsQueryOptions } from '~/core/queries/functions/list'
import { recreateFunctionQuery } from '~/core/queries/functions/recreate'
import type { FunctionShape, RoutineKind } from '~/core/queries/functions/shape'
import {
  getFunctionBodyTemplate,
  replacesRoutine,
} from '~/core/queries/functions/shape'
import { queryClient } from '~/lib/query-client'

import {
  BodyField,
  resetFields,
  SchemaField,
  SelectField,
  SwitchField,
  TextField,
} from '../components/fields'
import type { SectionInspectorProps } from '../components/inspector'
import {
  Inspector,
  InspectorSection,
  InspectorSql,
  replaceWarning,
} from '../components/inspector'
import { DefinitionsPage } from '../components/page'
import { useDefinitionsState } from '../hooks/use-definitions-state'
import { useFilter } from '../hooks/use-filter'
import type { DefinitionsColumn } from '../lib/columns'
import { labelColumn, nameColumn, textColumn } from '../lib/columns'

type FunctionItem = typeof functionsType.infer
type FunctionType = FunctionItem['type']

const typeLabels: Record<FunctionType, string> = {
  function: 'Function',
  procedure: 'Procedure',
}

const kinds = Object.keys(typeLabels) as RoutineKind[]

const kindDescriptions: Record<RoutineKind, string> = {
  function: 'A function returns a value, so queries can call it.',
  procedure: 'A procedure runs for its effects and returns nothing.',
}

interface FunctionDraft {
  args: string
  behavior: string
  body: string
  extras: string
  kind: RoutineKind
  language: string
  name: string
  returnType: string
  schema: string
  schemaBound: boolean
  securityDefiner: boolean
}

const functionSchema = type({
  body: type(/\S/u).configure({ message: 'Write the routine body.' }),
  kind: 'string',
  name: 'string',
  returnType: 'string',
}).narrow((draft, ctx) => {
  const named =
    /\S/u.test(draft.name) ||
    ctx.reject({
      message: `Give the ${draft.kind} a name.`,
      relativePath: ['name'],
    })
  const returns =
    draft.kind === 'procedure' ||
    /\S/u.test(draft.returnType) ||
    ctx.reject({
      message: 'Say what the function returns.',
      relativePath: ['returnType'],
    })

  return named && returns
})

const TRIGGER_FUNCTION_BODY = 'BEGIN\n  RETURN NEW;\nEND;'

const newDraft = (
  pageSchema: string,
  dialect: Dialect,
  preset?: string
): FunctionDraft => {
  const { behaviors, languages } = getCapabilities(dialect).functions
  const language = languages[0] ?? ''
  const trigger = preset === 'trigger'

  return {
    args: '',
    behavior: behaviors[0] ?? '',
    body: trigger
      ? TRIGGER_FUNCTION_BODY
      : getFunctionBodyTemplate({
          dialect,
          kind: 'function',
          language,
          returnType: '',
        }),
    extras: '',
    kind: 'function',
    language,
    name: '',
    returnType: trigger ? 'trigger' : '',
    schema: pageSchema,
    schemaBound: false,
    securityDefiner: false,
  }
}

const getDraft = (
  item: FunctionItem | null,
  pageSchema: string,
  dialect: Dialect,
  preset?: string
): FunctionDraft => {
  const fallback = newDraft(pageSchema, dialect, preset)

  return item
    ? {
        ...fallback,
        args: item.args ?? '',
        behavior: item.behavior || fallback.behavior,
        body: item.body,
        extras: item.extras,
        kind: item.type,
        language: item.language || fallback.language,
        name: item.name,
        returnType: item.return_type ?? '',
        schema: item.schema,
        schemaBound: item.schemaBound,
        securityDefiner: item.securityDefiner,
      }
    : fallback
}

const getShape = (
  draft: FunctionDraft,
  dialect: Dialect,
  item: FunctionItem | null
): FunctionShape => ({
  args: draft.args.trim(),
  behavior: draft.kind === 'procedure' ? '' : draft.behavior,
  body: draft.body,
  extras: draft.extras,
  kind: draft.kind,
  language: draft.language,
  name: submittedName(dialect, draft.name, item),
  returnType: draft.returnType.trim(),
  schemaBound: draft.kind === 'function' && draft.schemaBound,
  securityDefiner: draft.securityDefiner,
})

const formEditable = (item: FunctionItem, dialect: Dialect) => {
  const { languages } = getCapabilities(dialect).functions

  return (
    !item.custom &&
    !!item.body &&
    item.args !== null &&
    item.return_type !== 'table' &&
    (item.type === 'procedure' || !!item.return_type) &&
    (languages.length === 0 || languages.includes(item.language ?? ''))
  )
}

const hasExecutionOptions = ({
  behaviors,
  languages,
  schemaBinding,
  securityDefiner,
}: ReturnType<typeof getCapabilities>['functions']) =>
  languages.length > 0 ||
  behaviors.length > 0 ||
  schemaBinding ||
  securityDefiner

const FunctionInspector = ({
  can,
  connectionResource,
  item,
  onOpenChange,
  preset,
  queryKey,
  run,
  schemas,
  selectedSchema,
  dialect,
}: SectionInspectorProps<FunctionItem>) => {
  const options = getCapabilities(dialect).functions
  const mutation = useMutation({
    meta: { event: 'function_saved' },
    mutationFn: (draft: FunctionDraft) =>
      run(
        item
          ? recreateFunctionQuery({
              identity: item.identity,
              kind: item.type,
              name: item.name,
              replacesObject: replacesRoutine(
                {
                  args: item.args ?? null,
                  kind: item.type,
                  name: item.name,
                  returnType: item.return_type,
                },
                getShape(draft, dialect, item),
                dialect
              ),
              schema: item.schema,
              shape: getShape(draft, dialect, item),
            })
          : createFunctionQuery({
              schema: draft.schema,
              shape: getShape(draft, dialect, item),
            })
      ),
    onSuccess: async (_result, draft) => {
      await queryClient.invalidateQueries({ queryKey })
      toast.success(
        `${typeLabels[draft.kind]} "${getShape(draft, dialect, item).name}" ${item ? 'saved' : 'created'}`
      )
      onOpenChange(false)
    },
  })
  const form = useAppForm({
    defaultValues: getDraft(item, selectedSchema ?? '', dialect, preset),
    onSubmit: ({ value }) => {
      mutation.mutate(value)
    },
    validators: { onChange: functionSchema, onMount: functionSchema },
  })
  const draft = useSelector(form.store, (state) => state.values)

  const readOnly = item
    ? !can.edit || !formEditable(item, dialect)
    : !can.create
  const execution = hasExecutionOptions(options)
  const retemplate = (next: FunctionDraft) => {
    const template = getFunctionBodyTemplate({ dialect, ...next })

    if (
      !item &&
      draft.body === getFunctionBodyTemplate({ dialect, ...draft })
    ) {
      resetFields(form, { body: template })
    }
  }
  const returns = draft.kind === 'function'
  const saved =
    item && getShape(getDraft(item, draft.schema, dialect), dialect, item)
  const changed = !saved || !sameShape(getShape(draft, dialect, item), saved)

  return (
    <Inspector
      canSave={changed}
      description={item?.schema ?? draft.schema}
      form={form}
      item={item}
      mutation={mutation}
      noun={draft.kind}
      readOnly={readOnly}
      warning={
        item
          ? replaceWarning({ dialect, name: item.name, noun: item.type })
          : undefined
      }
    >
      <InspectorSection
        title="General"
        description="A routine the database stores and runs on demand."
      >
        <form.AppField name="schema">
          {() => (
            <SchemaField disabled={readOnly || !!item} schemas={schemas} />
          )}
        </form.AppField>
        <form.AppField name="name">
          {() => <TextField label="Name" autoFocus disabled={readOnly} />}
        </form.AppField>
        <form.AppField name="kind">
          {() => (
            <SelectField
              label="Type"
              description={kindDescriptions[draft.kind]}
              disabled={readOnly}
              getLabel={(value: RoutineKind) => typeLabels[value]}
              onChanged={(kind: RoutineKind) => retemplate({ ...draft, kind })}
              options={kinds}
              placeholder="Type"
            />
          )}
        </form.AppField>
      </InspectorSection>
      <InspectorSection
        title="Signature"
        description="What callers pass in, and what comes back."
      >
        <form.AppField name="args">
          {() => (
            <TextField
              label="Arguments"
              description="Written as SQL, the way the routine declares them."
              disabled={readOnly}
              placeholder={options.argumentPlaceholder}
            />
          )}
        </form.AppField>
        {returns && (
          <form.AppField
            name="returnType"
            listeners={{
              onChange: ({ value }) =>
                retemplate({ ...draft, returnType: value }),
            }}
          >
            {() => (
              <TextField
                label="Returns"
                disabled={readOnly}
                placeholder="integer"
              />
            )}
          </form.AppField>
        )}
      </InspectorSection>
      {execution && (
        <InspectorSection
          title="Execution"
          description="How the database plans and runs the body."
        >
          {options.languages.length > 0 && (
            <form.AppField name="language">
              {() => (
                <SelectField
                  label="Language"
                  disabled={readOnly}
                  options={options.languages}
                  placeholder="Language"
                  onChanged={(language: string) =>
                    retemplate({ ...draft, language })
                  }
                />
              )}
            </form.AppField>
          )}
          {returns && options.behaviors.length > 0 && (
            <form.AppField name="behavior">
              {() => (
                <SelectField
                  label="Behavior"
                  description="Tells the planner how far it may cache the result."
                  disabled={readOnly}
                  options={options.behaviors}
                  placeholder="Behavior"
                />
              )}
            </form.AppField>
          )}
          {returns && options.schemaBinding && (
            <form.AppField name="schemaBound">
              {() => (
                <SwitchField
                  title="Schema bound"
                  description="Locks the tables it reads against changes. Policy predicates require it."
                  disabled={readOnly}
                />
              )}
            </form.AppField>
          )}
          {options.securityDefiner && (
            <form.AppField name="securityDefiner">
              {() => (
                <SwitchField
                  title="Security definer"
                  description="Runs with the owner's rights instead of the caller's."
                  disabled={readOnly}
                />
              )}
            </form.AppField>
          )}
        </InspectorSection>
      )}
      <InspectorSection title="Definition">
        <form.AppField name="body">
          {() => (
            <BodyField
              label="Body"
              disabled={readOnly}
              language={languageIds[dialect]}
            />
          )}
        </form.AppField>
      </InspectorSection>
      {item && (
        <InspectorSql
          query={functionDefinitionQueryOptions({ connectionResource, item })}
        />
      )}
    </Inspector>
  )
}

const columns: DefinitionsColumn<FunctionItem>[] = [
  nameColumn({ icon: () => SourceCodeIcon, width: '3/12' }),
  labelColumn({
    getLabel: (item: FunctionItem, { search }) =>
      item.language && <HighlightText text={item.language} match={search} />,
    header: 'Language',
    width: '2/12',
  }),
  textColumn({
    header: 'Returns',
    valueOf: (item: FunctionItem) => item.return_type,
  }),
  textColumn({
    header: 'Arguments',
    valueOf: (item: FunctionItem) => item.args,
    width: '3/12',
  }),
  labelColumn({
    align: 'end',
    getLabel: (item: FunctionItem) => typeLabels[item.type],
    header: 'Type',
    width: '2/12',
  }),
]

const functionKey = (item: FunctionItem) =>
  JSON.stringify([item.schema, item.name, item.identity ?? '', item.type])

export const Functions = () => {
  const state = useDefinitionsState({ section: 'functions' })
  const { connectionResource, run, search, selectedSchema } = state
  const query = resourceFunctionsQueryOptions({ connectionResource })
  const { data: functions = [], isPending } = useQuery(query)
  const typeFilter = useFilter<FunctionType>('All types', [
    { label: 'Functions', value: 'function' },
    { label: 'Procedures', value: 'procedure' },
  ])

  const inSchema = functions.filter((item) => item.schema === selectedSchema)
  const matches = (item: FunctionItem) =>
    typeFilter.matches(item.type) &&
    matchesSearch(search, item.name, item.language, item.return_type)

  return (
    <DefinitionsPage
      columns={columns}
      dropItem={(item, cascade) =>
        run(
          dropFunctionQuery({
            cascade,
            identity: item.identity,
            kind: item.type,
            name: item.name,
            schema: item.schema,
          })
        )
      }
      Inspector={FunctionInspector}
      items={inSchema}
      getKey={functionKey}
      loading={isPending}
      match={matches}
      queryKey={query.queryKey}
      state={state}
      toolbar={typeFilter.control}
    />
  )
}
