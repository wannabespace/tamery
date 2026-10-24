import { FIELD_EDITOR_OPTIONS, Monaco } from '@tamery/monaco/editor'
import {
  SQL_COMPLETION_OPTIONS,
  languageIds,
} from '@tamery/monaco/sql-language'
import type { SqlDialect } from '@tamery/shared/enums/connection-type'
import { dialects, splitStatements } from '@tamery/sql'
import { Field, FieldError, FieldLabel } from '@tamery/ui/components/field'
import { Switch } from '@tamery/ui/components/switch'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import type { editor } from 'monaco-editor'
import type { RefObject } from 'react'
import {
  createRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

import { OptionField } from '~/components/option-field'
import { getCapabilities } from '~/core/catalog/capabilities'
import { useConnectionContext } from '~/core/connection/route'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { createViewQuery } from '~/core/queries/views/create'
import { connectionResourceToQueryParams } from '~/core/runtime/query'
import { attachSqlSource } from '~/core/sql-editor/sql-source'
import type { TableDialogRequest } from '~/core/table/table-dialog'
import { TableDialog } from '~/core/table/table-dialog'
import { openTab } from '~/core/tabs/actions'
import { tableTabId } from '~/core/tabs/ids'
import { queryClient } from '~/lib/query-client'

const QUERY_EDITOR_OPTIONS = {
  ...SQL_COMPLETION_OPTIONS,
  ...FIELD_EDITOR_OPTIONS,
  ariaLabel: 'Query',
}

export const createViewDialogRef = createRef<{
  create: (schema?: string) => void
}>()

const QueryField = ({
  editorRef,
  error,
  onChange,
  value,
}: {
  editorRef: RefObject<editor.IStandaloneCodeEditor | null>
  error: string | null
  onChange: (value: string) => void
  value: string
}) => {
  const { connection, connectionResource, dialect } = useConnectionContext()

  useEffect(() => {
    const codeEditor = editorRef.current
    return codeEditor
      ? attachSqlSource(
          codeEditor,
          connectionResource,
          connection.type,
          dialect
        )
      : undefined
  }, [editorRef, connectionResource, connection.type, dialect])

  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel>Query</FieldLabel>
        {error && <FieldError>{error}</FieldError>}
      </div>
      <Monaco
        ref={editorRef}
        data-mask
        className="ring-foreground/4 h-40 rounded-xl ring"
        language={languageIds[dialect]}
        value={value}
        options={QUERY_EDITOR_OPTIONS}
        onChange={onChange}
        leaveOnEscape
        onSubmit={() =>
          editorRef.current
            ?.getContainerDomNode()
            .closest('form')
            ?.requestSubmit()
        }
      />
    </Field>
  )
}

export const CreateViewDialog = ({ dialect }: { dialect: SqlDialect }) => {
  const { connectionResource, defaultSchema } = useConnectionContext()
  const router = useRouter()
  const editorRef = useRef<editor.IStandaloneCodeEditor>(null)
  const [request, setRequest] = useState<TableDialogRequest | null>(null)
  const [query, setQuery] = useState('')
  const [materialized, setMaterialized] = useState(false)
  const [queryRefused, setQueryRefused] = useState(false)
  const { data: tablesAndSchemas } = useQuery(
    resourceTablesAndSchemasQueryOptions({ connectionResource })
  )
  const schemas = tablesAndSchemas?.schemas ?? []
  const statements = splitStatements(query, dialects[dialect])
  let queryError: string | null = null
  if (queryRefused && statements.length === 0) {
    queryError = 'Write the query the view selects.'
  } else if (queryRefused && statements.length > 1) {
    queryError = 'A view saves a single query.'
  }

  const {
    error,
    isPending,
    mutate: createView,
    reset,
  } = useMutation({
    meta: { event: 'view_created' },
    mutationFn: async (view: {
      materialized: boolean
      query: string
      schema: string
      view: string
    }) => {
      await createViewQuery(view).run(
        await connectionResourceToQueryParams(connectionResource)
      )
    },
    onSuccess: async (_, { schema, view }) => {
      setRequest(null)
      await queryClient.invalidateQueries({
        queryKey: ['connection-resource', connectionResource.id],
      })
      openTab(connectionResource.id, tableTabId(schema, view))
      router.navigate({
        params: {
          resourceId: connectionResource.id,
          tabId: tableTabId(schema, view),
        },
        to: '/connection/$resourceId/$tabId',
      })
    },
  })

  useImperativeHandle(createViewDialogRef, () => ({
    create: (schema) => {
      reset()
      setQuery('')
      setMaterialized(false)
      setQueryRefused(false)
      setRequest({
        schema: schema ?? defaultSchema ?? schemas[0]?.name ?? '',
        table: null,
      })
    },
  }))

  return (
    <TableDialog
      noun="view"
      description="A saved query that reads like a table."
      error={error}
      shortcut={<ShortcutKbd shortcut="submit" />}
      request={request}
      schemas={schemas.map(({ name }) => name)}
      isTaken={(schema, name) =>
        schemas.some(
          (entry) =>
            entry.name === schema &&
            entry.tables.some((table) => table.name === name)
        )
      }
      pending={isPending}
      onOpenChange={(open) => !open && setRequest(null)}
      onSubmit={(_, schema, view) => {
        const [statement] = statements
        if (statement && statements.length === 1) {
          createView({ materialized, query: statement.text, schema, view })
        } else {
          setQueryRefused(true)
          editorRef.current?.focus()
        }
      }}
    >
      <QueryField
        editorRef={editorRef}
        error={queryError}
        value={query}
        onChange={setQuery}
      />
      {getCapabilities(dialect).flags.includes('materializedViews') && (
        <OptionField
          htmlFor="view-dialog-materialized"
          title="Materialized"
          description="Stores the query's rows instead of running it on every read."
        >
          <Switch
            id="view-dialog-materialized"
            size="sm"
            checked={materialized}
            onCheckedChange={setMaterialized}
          />
        </OptionField>
      )}
    </TableDialog>
  )
}
