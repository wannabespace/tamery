import { FieldDescription } from '@tamery/ui/components/field'
import { Switch } from '@tamery/ui/components/switch'
import { useAppForm } from '@tamery/ui/components/tanstack-form'
import { useSelector } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { OptionField } from '~/components/option-field'
import { getCapabilities } from '~/core/catalog/capabilities'
import { queryClient } from '~/lib/query-client'

import {
  resetFields,
  SchemaField,
  SelectField,
  SqlField,
  TextField,
} from '../../components/fields'
import type {
  InspectorWarning,
  SectionInspectorProps,
} from '../../components/inspector'
import { Inspector, InspectorSection } from '../../components/inspector'
import type { PolicyDraft, PolicyItem } from './policy-draft'
import {
  getChanges,
  clearsExpression,
  getDraft,
  expressionsFor,
  kindLabels,
  kinds,
  policySchema,
  replaces,
  savePolicy,
  withAllowedExpressions,
} from './policy-draft'
import { useEnabledToggle } from './use-enabled-toggle'

const replaceWarning = (
  item: PolicyItem,
  draft: PolicyDraft
): InspectorWarning => ({
  action: 'Replace policy',
  description: (
    <>
      {clearsExpression(item, draft)
        ? 'An expression cannot come off a policy in place, so we recreate '
        : 'Command and permissive/restrictive cannot change in place, so we recreate '}
      <span data-mask className="font-medium">
        {item.name}
      </span>{' '}
      in one transaction. Its comment and any grants on it do not come back.
    </>
  ),
})

export const PolicyInspector = ({
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
}: SectionInspectorProps<PolicyItem>) => {
  const mutation = useMutation({
    meta: { event: 'policy_saved' },
    mutationFn: (draft: PolicyDraft) =>
      savePolicy({ dialect, draft, item, run }),
    onSuccess: async (_result, draft) => {
      await queryClient.invalidateQueries({ queryKey })
      toast.success(
        `Policy "${draft.name.trim()}" ${item ? 'saved' : 'created'}`
      )
      onOpenChange(false)
    },
  })
  const rowLevelSecurity = useEnabledToggle({
    connectionResource,
    item,
    queryKey,
    run,
    subject: `row level security on "${item?.table}"`,
  })
  const form = useAppForm({
    defaultValues: getDraft(item, selectedSchema ?? '', dialect),
    onSubmit: ({ value }) => {
      mutation.mutate(withAllowedExpressions(value))
    },
    validators: { onChange: policySchema, onMount: policySchema },
  })
  const draft = withAllowedExpressions(
    useSelector(form.store, (state) => state.values)
  )

  const readOnly = item ? !can.edit : !can.create
  const { flags, policies: options } = getCapabilities(dialect)
  const rlsTables = flags.includes('rowLevelSecurity')
  const expressions = expressionsFor(draft.command)
  const checks = options.commands.some(
    (command) => expressionsFor(command).check
  )
  const replacing = !!item && replaces(item, draft, dialect)
  const changed =
    !item ||
    replacing ||
    Object.values(getChanges(item, draft)).some((change) => change !== null)

  return (
    <Inspector
      canSave={changed}
      description={item ? `${item.schema}.${item.table}` : draft.schema}
      form={form}
      item={item}
      mutation={mutation}
      noun="policy"
      readOnly={readOnly}
      warning={item && replacing ? replaceWarning(item, draft) : undefined}
    >
      {item && rlsTables && (
        <InspectorSection title="Status">
          <OptionField
            htmlFor="policy-row-level-security"
            title="Row level security"
            description={
              item.enabled
                ? 'On, the table applies its policies.'
                : 'Off, the table ignores every policy on it.'
            }
          >
            <Switch
              id="policy-row-level-security"
              size="sm"
              disabled={rowLevelSecurity.isPending}
              checked={item.enabled}
              onCheckedChange={(enabled) =>
                rowLevelSecurity.mutate({ enabled })
              }
            />
          </OptionField>
        </InspectorSection>
      )}
      <InspectorSection
        title="General"
        description="A policy decides which rows a role may see or write."
      >
        <form.AppField name="schema">
          {() => (
            <SchemaField
              disabled={readOnly || !!item}
              schemas={schemas}
              onChanged={() => resetFields(form, { table: '' })}
            />
          )}
        </form.AppField>
        <form.AppField name="name">
          {() => <TextField label="Name" autoFocus disabled={readOnly} />}
        </form.AppField>
        <form.AppField name="table">
          {() => (
            <SelectField
              label="Table"
              description={
                rlsTables
                  ? 'The policy only applies while row level security is enabled on this table.'
                  : undefined
              }
              disabled={readOnly || !!item}
              options={
                item ? [item.table] : getRelationNames(draft.schema, 'table')
              }
              placeholder="Choose a table"
            />
          )}
        </form.AppField>
      </InspectorSection>
      <InspectorSection
        title="Scope"
        description="Which statements the policy answers for, and who it answers for."
      >
        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="command">
            {() => (
              <SelectField
                label="Command"
                disabled={readOnly}
                options={options.commands}
                placeholder="Command"
              />
            )}
          </form.AppField>
          <form.AppField name="kind">
            {() => (
              <SelectField
                label="Type"
                disabled={readOnly}
                options={kinds}
                getLabel={(value) => kindLabels[value]}
                placeholder="Type"
              />
            )}
          </form.AppField>
        </div>
        <FieldDescription>
          Permissive policies widen access, restrictive ones narrow it: every
          restrictive policy must also pass.
        </FieldDescription>
        <form.AppField name="roles">
          {() => (
            <TextField
              label="Roles"
              description={`Comma-separated. Empty means ${options.everyone}.`}
              disabled={readOnly}
              placeholder={options.everyone.toLowerCase()}
            />
          )}
        </form.AppField>
      </InspectorSection>
      <InspectorSection
        title="Expressions"
        description="SQL returning true for the rows the policy allows."
      >
        <form.AppField name="using">
          {() => (
            <SqlField
              label="Using"
              description={
                expressions.using
                  ? 'Checked against rows that already exist.'
                  : 'An insert has no existing rows to check.'
              }
              disabled={readOnly || !expressions.using}
              placeholder="user_id = auth.uid()"
            />
          )}
        </form.AppField>
        {checks && (
          <form.AppField name="check">
            {() => (
              <SqlField
                label="With check"
                description={
                  expressions.check
                    ? 'Checked against rows an insert or update would write.'
                    : `A ${draft.command.toLowerCase()} writes no rows to check.`
                }
                disabled={readOnly || !expressions.check}
                placeholder="user_id = auth.uid()"
              />
            )}
          </form.AppField>
        )}
      </InspectorSection>
    </Inspector>
  )
}
