import { Delete02Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { sameShape, uppercaseFirst } from '@tamery/shared/utils'
import { Button } from '@tamery/ui/components/button'
import { Switch } from '@tamery/ui/components/switch'
import { useAppForm } from '@tamery/ui/components/tanstack-form'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useSelector } from '@tanstack/react-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

import { OptionField } from '~/components/option-field'
import { resourceFunctionsQueryOptions } from '~/core/queries/functions/list'
import { alterPolicyQuery } from '~/core/queries/policies/alter'
import { createPolicyQuery } from '~/core/queries/policies/create'
import { policyPredicate } from '~/core/queries/policies/shape'
import { queryClient } from '~/lib/query-client'

import {
  SchemaField,
  SearchSelectField,
  SelectField,
  TextField,
} from '../../components/fields'
import type { SectionInspectorProps } from '../../components/inspector'
import { Inspector, InspectorSection } from '../../components/inspector'
import type { PolicyItem } from './policy-draft'
import type { PredicatePolicyDraft } from './predicate-draft'
import {
  blockOperations,
  newPredicate,
  operationLabel,
  predicateKinds,
  getPredicate,
  getPredicatePlan,
  getPredicatePolicyDraft,
  predicatePolicySchema,
  qualifiedKey,
  qualifiedLabel,
} from './predicate-draft'
import { useEnabledToggle } from './use-enabled-toggle'

export const PredicatePolicyInspector = ({
  can,
  connectionResource,
  item,
  getRelationNames,
  onOpenChange,
  queryKey,
  run,
  schemas,
  selectedSchema,
}: SectionInspectorProps<PolicyItem>) => {
  const { data: functions = [], isPending: functionsPending } = useQuery(
    resourceFunctionsQueryOptions({ connectionResource })
  )
  const mutation = useMutation({
    meta: { event: 'policy_saved' },
    mutationFn: (draft: PredicatePolicyDraft) =>
      run(
        item
          ? alterPolicyQuery({
              ...getPredicatePlan(item, draft),
              name: item.name,
              schema: item.schema,
              table: item.table,
            })
          : createPolicyQuery({
              schema: draft.schema,
              shape: {
                check: null,
                command: 'ALL',
                kind: 'RESTRICTIVE',
                name: draft.name.trim(),
                predicates: draft.predicates.map(getPredicate),
                roles: [],
                using: null,
              },
              table: '',
            })
      ),
    onSuccess: async (_result, draft) => {
      await queryClient.invalidateQueries({ queryKey })
      toast.success(
        `Policy "${draft.name.trim()}" ${item ? 'saved' : 'created'}`
      )
      onOpenChange(false)
    },
  })
  const state = useEnabledToggle({
    connectionResource,
    item,
    queryKey,
    run,
    subject: `policy "${item?.name}"`,
  })
  const form = useAppForm({
    defaultValues: getPredicatePolicyDraft(item, selectedSchema ?? ''),
    onSubmit: ({ value }) => {
      mutation.mutate(value)
    },
    validators: {
      onChange: predicatePolicySchema,
      onMount: predicatePolicySchema,
    },
  })
  const draft = useSelector(form.store, (store) => store.values)

  const readable = !!item?.predicates?.every(
    (predicate) => policyPredicate.parse(predicate.definition) !== null
  )
  const readOnly = item ? !can.edit || !readable : !can.create
  const tables = schemas.flatMap((schema) =>
    getRelationNames(schema, 'table').map((table) =>
      qualifiedKey(schema, table)
    )
  )
  const predicateFunctions = functions
    .filter((fn) => fn.inline && fn.schemaBound)
    .map((fn) => qualifiedKey(fn.schema, fn.name))
  const changed =
    !item || !sameShape(draft, getPredicatePolicyDraft(item, item.schema))

  return (
    <Inspector
      canSave={changed}
      description={item ? item.schema : draft.schema}
      form={form}
      item={item}
      mutation={mutation}
      noun="policy"
      readOnly={readOnly}
    >
      {item && (
        <InspectorSection title="Status">
          <OptionField
            htmlFor="policy-enabled"
            title="Enabled"
            description="A disabled policy keeps its predicates but filters and blocks nothing."
          >
            <Switch
              id="policy-enabled"
              size="sm"
              disabled={state.isPending}
              checked={item.enabled}
              onCheckedChange={(enabled) => state.mutate({ enabled })}
            />
          </OptionField>
        </InspectorSection>
      )}
      <InspectorSection
        title="General"
        description="A policy binds predicate functions to tables, and SQL Server calls them for every row."
      >
        <form.AppField name="schema">
          {() => (
            <SchemaField disabled={readOnly || !!item} schemas={schemas} />
          )}
        </form.AppField>
        <form.AppField name="name">
          {() => <TextField label="Name" autoFocus disabled={readOnly} />}
        </form.AppField>
      </InspectorSection>
      {draft.predicates.map((predicate, index) => (
        <InspectorSection
          key={index}
          title={`Predicate ${index + 1}`}
          description={
            predicate.kind === 'FILTER'
              ? 'Hides the rows the function returns nothing for.'
              : 'Refuses writes that leave a row the function returns nothing for.'
          }
          action={
            !readOnly && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-xs"
                      variant="ghost-muted"
                      className="-mt-0.5"
                      aria-label="Remove predicate"
                      onClick={() => form.removeFieldValue('predicates', index)}
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                    </Button>
                  }
                />
                <TooltipContent side="left">Remove predicate</TooltipContent>
              </Tooltip>
            )
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <form.AppField name={`predicates[${index}].kind`}>
              {() => (
                <SelectField
                  label="Type"
                  disabled={readOnly}
                  getLabel={(kind) => uppercaseFirst(kind.toLowerCase())}
                  options={predicateKinds}
                  placeholder="Type"
                />
              )}
            </form.AppField>
            {predicate.kind === 'BLOCK' && (
              <form.AppField name={`predicates[${index}].operation`}>
                {() => (
                  <SelectField
                    label="Operation"
                    disabled={readOnly}
                    getLabel={operationLabel}
                    options={blockOperations}
                    placeholder="Operation"
                  />
                )}
              </form.AppField>
            )}
          </div>
          <form.AppField name={`predicates[${index}].tableKey`}>
            {() => (
              <SearchSelectField
                label="Table"
                disabled={readOnly}
                empty="This database has no tables."
                getLabel={qualifiedLabel}
                options={tables}
                placeholder="Choose a table"
              />
            )}
          </form.AppField>
          <form.AppField name={`predicates[${index}].functionKey`}>
            {() => (
              <SelectField
                label="Function"
                description="An inline table-valued function, created schema bound."
                disabled={readOnly}
                empty={
                  functionsPending
                    ? 'Loading…'
                    : 'No schema-bound inline table-valued function here.'
                }
                getLabel={qualifiedLabel}
                options={predicateFunctions}
                placeholder="Choose a function"
              />
            )}
          </form.AppField>
          <form.AppField name={`predicates[${index}].arguments`}>
            {() => (
              <TextField
                label="Arguments"
                description="Columns of the table, in the order the function takes them."
                disabled={readOnly}
                placeholder="TenantId"
              />
            )}
          </form.AppField>
        </InspectorSection>
      ))}
      {!readOnly && (
        <div className="p-4">
          <Button
            variant="outline"
            onClick={() => form.pushFieldValue('predicates', newPredicate)}
          >
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            Add predicate
          </Button>
        </div>
      )}
    </Inspector>
  )
}
