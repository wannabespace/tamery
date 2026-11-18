import { matchesSearch } from '@tamery/shared/utils'
import { useAppForm } from '@tamery/ui/components/tanstack-form'
import { useSelector } from '@tanstack/react-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { type } from 'arktype'
import { toast } from 'sonner'

import { grantPrivilegeQuery } from '~/core/queries/privileges/grant'
import type { privilegeType } from '~/core/queries/privileges/list'
import { resourcePrivilegesQueryOptions } from '~/core/queries/privileges/list'
import { revokePrivilegeQuery } from '~/core/queries/privileges/revoke'
import type { PrivilegeTarget } from '~/core/queries/privileges/shape'
import {
  ALL_TABLES,
  grantCoversSchema,
  PRIVILEGE_TYPES,
} from '~/core/queries/privileges/shape'
import { queryClient } from '~/lib/query-client'

import {
  SchemaField,
  SearchSelectField,
  SelectField,
  SwitchField,
  TextField,
  resetFields,
} from '../components/fields'
import type { SectionInspectorProps } from '../components/inspector'
import { Inspector, InspectorSection } from '../components/inspector'
import { DefinitionsPage } from '../components/page'
import { useDefinitionsState } from '../hooks/use-definitions-state'
import { useFilter } from '../hooks/use-filter'
import type { DefinitionsColumn } from '../lib/columns'
import { labelColumn, textColumn } from '../lib/columns'

type PrivilegeItem = typeof privilegeType.infer

const tableLabel = (table: string) =>
  table === ALL_TABLES ? 'All tables' : table

const privilegeSchema = type({
  grantee: type(/\S/u).configure({
    message: 'Name the account, as user@host.',
  }),
  table: type(/\S/u).configure({ message: 'Pick a table, or all of them.' }),
})

const PrivilegeInspector = ({
  can,
  item,
  onOpenChange,
  queryKey,
  getRelationNames,
  run,
  schemas,
  selectedSchema,
}: SectionInspectorProps<PrivilegeItem>) => {
  const mutation = useMutation({
    meta: { event: 'privilege_saved' },
    mutationFn: (draft: PrivilegeTarget) =>
      run(grantPrivilegeQuery({ ...draft, grantee: draft.grantee.trim() })),
    onSuccess: async (_result, draft) => {
      await queryClient.invalidateQueries({ queryKey })
      toast.success(`Granted ${draft.privilege} to ${draft.grantee.trim()}`)
      onOpenChange(false)
    },
  })
  const form = useAppForm({
    defaultValues: {
      grantable: item?.grantable ?? false,
      grantee: item?.grantee ?? '',
      privilege: item?.privilege ?? PRIVILEGE_TYPES[0],
      schema: item?.schema ?? selectedSchema ?? '',
      table: item?.table ?? ALL_TABLES,
    } satisfies PrivilegeTarget,
    onSubmit: ({ value }) => {
      mutation.mutate(value)
    },
    validators: { onChange: privilegeSchema, onMount: privilegeSchema },
  })
  const draft = useSelector(form.store, (state) => state.values)
  const readOnly = !!item || !can.create

  return (
    <Inspector
      canSave={!item}
      description={item ? item.grantee : draft.schema}
      form={form}
      item={item}
      mutation={mutation}
      noun="privilege"
      readOnly={readOnly}
      saveLabel="Grant privilege"
    >
      <InspectorSection
        title="General"
        description="A privilege lets an account run one kind of statement on a database or a table."
      >
        <form.AppField name="grantee">
          {() => (
            <TextField
              label="Account"
              autoFocus
              description="user@host. A bare user means any host."
              disabled={readOnly}
              placeholder="app@%"
            />
          )}
        </form.AppField>
        <form.AppField name="privilege">
          {() => (
            <SelectField
              label="Privilege"
              disabled={readOnly}
              options={item ? [item.privilege] : PRIVILEGE_TYPES}
              placeholder="Privilege"
            />
          )}
        </form.AppField>
      </InspectorSection>
      <InspectorSection
        title="Target"
        description="The database the privilege covers, and one table of it or all of them."
      >
        <form.AppField name="schema">
          {() => (
            <SchemaField
              disabled={readOnly}
              schemas={schemas}
              onChanged={() => resetFields(form, { table: ALL_TABLES })}
            />
          )}
        </form.AppField>
        <form.AppField name="table">
          {() => (
            <SearchSelectField
              label="Table"
              disabled={readOnly}
              getLabel={tableLabel}
              options={
                item
                  ? [item.table]
                  : [ALL_TABLES, ...getRelationNames(draft.schema, 'table')]
              }
              placeholder="Choose a table"
            />
          )}
        </form.AppField>
      </InspectorSection>
      <InspectorSection title="Options">
        <form.AppField name="grantable">
          {() => (
            <SwitchField
              title="Can grant"
              description="The account may pass this privilege on to others."
              disabled={readOnly}
            />
          )}
        </form.AppField>
      </InspectorSection>
    </Inspector>
  )
}

const columns: DefinitionsColumn<PrivilegeItem>[] = [
  textColumn({
    header: 'Account',
    valueOf: (item: PrivilegeItem) => item.grantee,
    width: '4/12',
  }),
  labelColumn({
    getLabel: (item: PrivilegeItem) => item.privilege,
    header: 'Privilege',
    width: '3/12',
  }),
  textColumn({
    header: 'Table',
    valueOf: (item: PrivilegeItem) => tableLabel(item.table),
  }),
  labelColumn({
    align: 'end',
    getLabel: (item: PrivilegeItem) => (item.grantable ? 'Yes' : 'No'),
    header: 'Can grant',
    width: '2/12',
  }),
]

const privilegeKey = (item: PrivilegeItem) =>
  JSON.stringify([item.grantee, item.schema, item.table, item.privilege])

export const Privileges = () => {
  const state = useDefinitionsState({ section: 'privileges' })
  const { connectionResource, run, search, selectedSchema } = state
  const query = resourcePrivilegesQueryOptions({ connectionResource })
  const { data: privileges = [], isPending } = useQuery(query)
  const privilegeFilter = useFilter<string>(
    'All privileges',
    PRIVILEGE_TYPES.map((privilege) => ({
      label: privilege,
      value: privilege,
    }))
  )

  return (
    <DefinitionsPage
      columns={columns}
      dropItem={(item) => run(revokePrivilegeQuery(item))}
      dropWording={(item) => ({
        action: 'Revoke',
        done: `Revoked ${item.privilege} from ${item.grantee}`,
        effect: 'The account loses this privilege at once.',
        title: `Revoke ${item.privilege} from ${item.grantee}?`,
      })}
      Inspector={PrivilegeInspector}
      items={privileges.filter((item) =>
        item.table === ALL_TABLES && selectedSchema
          ? grantCoversSchema(item.schema, selectedSchema)
          : item.schema === selectedSchema
      )}
      getKey={privilegeKey}
      loading={isPending}
      match={(item) =>
        privilegeFilter.matches(item.privilege) &&
        matchesSearch(
          search,
          item.grantee,
          item.grantee.replaceAll("'", ''),
          tableLabel(item.table),
          item.privilege
        )
      }
      queryKey={query.queryKey}
      state={state}
      toolbar={privilegeFilter.control}
    />
  )
}
