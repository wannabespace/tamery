import { languageIds } from '@tamery/monaco/sql-language'
import { sameShape } from '@tamery/shared/utils'
import { useAppForm } from '@tamery/ui/components/tanstack-form'
import { useSelector } from '@tanstack/react-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

import { getCapabilities } from '~/core/catalog/capabilities'
import { resourceFunctionsQueryOptions } from '~/core/queries/functions/list'
import { createTriggerQuery } from '~/core/queries/triggers/create'
import { triggerDefinitionQueryOptions } from '~/core/queries/triggers/definition'
import { recreateTriggerQuery } from '~/core/queries/triggers/recreate'
import type { TriggerEvent, TriggerTiming } from '~/core/queries/triggers/shape'
import {
  triggerEventsFor,
  triggerOrientationsFor,
} from '~/core/queries/triggers/shape'
import { queryClient } from '~/lib/query-client'

import {
  BodyField,
  Labelled,
  OptionSelect,
  OptionsField,
  resetFields,
  SchemaField,
  SelectField,
  TextField,
} from '../../components/fields'
import type { SectionInspectorProps } from '../../components/inspector'
import {
  Inspector,
  InspectorSection,
  InspectorSql,
  replaceWarning,
} from '../../components/inspector'
import type { TriggerDraft, TriggerItem } from './trigger-draft'
import {
  getDraft,
  formEditable,
  sentenceCase,
  getShape,
  triggerSchemas,
} from './trigger-draft'
import { TriggerStatus } from './trigger-status'

export const TriggerInspector = ({
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
}: SectionInspectorProps<TriggerItem>) => {
  const options = getCapabilities(dialect).triggers
  const { data: functions = [], isPending: functionsPending } = useQuery({
    ...resourceFunctionsQueryOptions({ connectionResource }),
    enabled: !options.body,
  })
  const mutation = useMutation({
    meta: { event: 'trigger_saved' },
    mutationFn: (draft: TriggerDraft) =>
      run(
        item
          ? recreateTriggerQuery({
              enabled: item.enabled,
              mode: item.enabledMode,
              name: item.name,
              schema: item.schema,
              shape: getShape(draft, dialect, item),
              table: item.table,
            })
          : createTriggerQuery({
              schema: draft.schema,
              shape: getShape(draft, dialect, item),
              table: draft.table,
            })
      ),
    onSuccess: async (_result, draft) => {
      await queryClient.invalidateQueries({ queryKey })
      toast.success(
        `Trigger "${getShape(draft, dialect, item).name}" ${item ? 'saved' : 'created'}`
      )
      onOpenChange(false)
    },
  })
  const schema = triggerSchemas[options.body ? 'body' : 'function']
  const form = useAppForm({
    defaultValues: getDraft(item, selectedSchema ?? '', dialect),
    onSubmit: ({ value }) => {
      const allowed = triggerOrientationsFor(value, options.orientations)

      mutation.mutate(
        allowed.includes(value.orientation)
          ? value
          : { ...value, orientation: allowed[0] ?? value.orientation }
      )
    },
    validators: { onChange: schema, onMount: schema },
  })
  const draft = useSelector(form.store, (state) => state.values)

  const readOnly = item
    ? !can.edit || !formEditable(item, options.body)
    : !can.create
  const orientations = triggerOrientationsFor(draft, options.orientations)
  const instead = draft.timing === 'INSTEAD OF'
  const targetsFor = (timing: TriggerTiming) =>
    timing === 'INSTEAD OF'
      ? options.insteadOfTargets.flatMap((target) =>
          getRelationNames(draft.schema, target)
        )
      : getRelationNames(draft.schema, 'table')
  const targets = item ? [item.table] : targetsFor(draft.timing)
  const timings = options.timings.filter(
    (timing) => !item || targetsFor(timing).includes(item.table)
  )
  const saved =
    item && getShape(getDraft(item, draft.schema, dialect), dialect, item)
  const changed = !saved || !sameShape(getShape(draft, dialect, item), saved)

  return (
    <Inspector
      canSave={changed}
      description={item ? `${item.schema}.${item.table}` : draft.schema}
      form={form}
      item={item}
      mutation={mutation}
      noun="trigger"
      readOnly={readOnly}
      warning={
        item
          ? replaceWarning({ dialect, name: item.name, noun: 'trigger' })
          : undefined
      }
    >
      {item && options.toggle && (
        <TriggerStatus item={item} queryKey={queryKey} run={run} />
      )}
      <InspectorSection
        title="General"
        description="A trigger runs whenever its table changes."
      >
        <form.AppField name="schema">
          {() => (
            <SchemaField
              disabled={readOnly || !!item}
              schemas={schemas}
              onChanged={() =>
                resetFields(form, { functionName: '', table: '' })
              }
            />
          )}
        </form.AppField>
        <form.AppField name="name">
          {() => <TextField label="Name" autoFocus disabled={readOnly} />}
        </form.AppField>
        <form.AppField name="table">
          {() => (
            <SelectField
              label={instead ? 'View' : 'Table'}
              description={
                instead
                  ? 'An instead-of trigger stands in for writes to a view.'
                  : 'The trigger watches changes on this table.'
              }
              disabled={readOnly || !!item}
              empty={`This schema has no ${instead ? 'views' : 'tables'}.`}
              options={targets}
              placeholder={`Choose a ${instead ? 'view' : 'table'}`}
            />
          )}
        </form.AppField>
      </InspectorSection>
      <InspectorSection
        title="Firing"
        description="Which changes wake the trigger, and when it runs."
      >
        <form.AppField name="events">
          {(field) =>
            options.multipleEvents ? (
              <OptionsField
                label="Events"
                description="Only the events chosen here fire the trigger."
                disabled={readOnly}
                options={triggerEventsFor(draft.timing, options.events)}
                placeholder="Choose events"
              />
            ) : (
              <Labelled
                label="Event"
                description="A trigger here answers to a single event."
              >
                <OptionSelect
                  id={field.name}
                  disabled={readOnly}
                  options={triggerEventsFor(draft.timing, options.events)}
                  placeholder="Choose an event"
                  value={field.state.value[0] ?? ''}
                  onValueChange={(event: TriggerEvent) =>
                    field.handleChange([event])
                  }
                />
              </Labelled>
            )
          }
        </form.AppField>
        <div className="grid grid-cols-2 gap-3">
          <form.AppField name="timing">
            {() => (
              <SelectField
                label="Timing"
                disabled={readOnly}
                getLabel={sentenceCase}
                options={timings}
                placeholder="Timing"
                onChanged={(timing: TriggerTiming) =>
                  resetFields(form, {
                    events: triggerEventsFor(timing, draft.events),
                    ...(targetsFor(timing).includes(draft.table)
                      ? {}
                      : { table: '' }),
                  })
                }
              />
            )}
          </form.AppField>
          {orientations.length > 1 && (
            <form.AppField name="orientation">
              {() => (
                <SelectField
                  label="For each"
                  disabled={readOnly}
                  getLabel={sentenceCase}
                  options={orientations}
                  placeholder="For each"
                />
              )}
            </form.AppField>
          )}
        </div>
      </InspectorSection>
      <InspectorSection
        title="Action"
        description="What the database runs when the trigger fires."
      >
        {options.body ? (
          <form.AppField name="body">
            {() => (
              <BodyField
                label="Body"
                description="Runs for every change the trigger answers to."
                disabled={readOnly}
                language={languageIds[dialect]}
              />
            )}
          </form.AppField>
        ) : (
          <form.AppField name="functionName">
            {() => (
              <SelectField
                label="Function"
                description="Functions in this schema that return a trigger."
                disabled={readOnly}
                empty={
                  functionsPending
                    ? 'Loading…'
                    : 'No function here returns a trigger.'
                }
                options={functions
                  .filter(
                    (fn) =>
                      fn.schema === draft.schema && fn.return_type === 'trigger'
                  )
                  .map((fn) => fn.name)}
                placeholder="Choose a function"
                onChanged={() =>
                  resetFields(form, { functionSchema: draft.schema })
                }
              />
            )}
          </form.AppField>
        )}
      </InspectorSection>
      {item && (
        <InspectorSql
          query={triggerDefinitionQueryOptions({ connectionResource, item })}
        />
      )}
    </Inspector>
  )
}
