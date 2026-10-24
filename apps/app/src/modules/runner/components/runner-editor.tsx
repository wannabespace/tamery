import { Monaco } from '@tamery/monaco/editor'
import {
  SQL_COMPLETION_OPTIONS,
  languageIds,
} from '@tamery/monaco/sql-language'
import { useQuery } from '@tanstack/react-query'
import type { editor } from 'monaco-editor'
import type { RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useSubscription } from 'seitu/react'

import { useTabContext } from '~/core/connection/route'
import { resourceEnumsQueryOptions } from '~/core/queries/enums/list'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { attachSqlSource } from '~/core/sql-editor/sql-source'
import { chatOpen } from '~/modules/chat/stores'

import { useRunnerActions } from '../lib/actions'
import { useEditorActions } from '../lib/editor-actions'
import type { FailedRunnerResult } from '../lib/run'
import { runnerResultsOptions } from '../lib/run'
import type { RunAnchor } from '../lib/statement-band'
import { sameSpot, useStatementBand } from '../lib/statement-band'
import { setQuery, useRunnerPageStore, useRunnerTab } from '../lib/store'
import { openMenuFromKeyboard, StatementControls } from './statement-controls'

const MONACO_OPTIONS = {
  contextmenu: false,
  ...SQL_COMPLETION_OPTIONS,
  folding: false,
  lineNumbersMinChars: 3,
  renderLineHighlight: 'none',
  scrollBeyondLastLine: false,
  wordWrap: 'on',
} satisfies editor.IStandaloneEditorConstructionOptions

export const RunnerEditor = ({
  editorRef,
  editing,
  reviewing,
  acceptAi,
  rejectAi,
}: {
  editorRef: RefObject<editor.IStandaloneCodeEditor | null>
  editing: boolean
  reviewing: boolean
  acceptAi: () => void
  rejectAi: () => void
}) => {
  const { connection, connectionResource, dialect } = useTabContext()
  const store = useRunnerPageStore()
  const query = useSubscription(store, { selector: (state) => state.query })
  const actions = useRunnerActions()
  const { data: run } = useQuery(runnerResultsOptions(useRunnerTab()))

  const sidePanelOpened = useSubscription(chatOpen(connectionResource.id))
  const [runAnchor, setRunAnchor] = useState<RunAnchor | null>(null)
  const statementMenuRef = useRef<HTMLButtonElement>(null)

  const failed = runAnchor
    ? run?.results.find(
        (result): result is FailedRunnerResult =>
          result.error !== null &&
          result.error.kind !== 'connection' &&
          result.start === runAnchor.start &&
          result.source === runAnchor.source
      )
    : undefined

  useEditorActions(
    editorRef,
    {
      ...actions,
      acceptAi,
      fixAi: () => failed && actions.fixWithAi(failed),
      openStatementMenu: () => openMenuFromKeyboard(statementMenuRef.current),
      rejectAi,
    },
    { failing: failed !== undefined, reviewing }
  )
  useStatementBand(editorRef, (anchor) =>
    setRunAnchor((current) =>
      sameSpot(current, anchor) &&
      sameSpot(current?.suggestion, anchor?.suggestion) &&
      current?.start === anchor?.start &&
      current?.source === anchor?.source
        ? current
        : anchor
    )
  )

  // The editor's catalog reads these from the cache; observing them keeps them cached and refetched on invalidation.
  useQuery({
    ...resourceTablesAndSchemasQueryOptions({ connectionResource }),
    throwOnError: false,
  })
  useQuery({
    ...resourceEnumsQueryOptions({ connectionResource }),
    throwOnError: false,
  })

  useEffect(() => {
    editorRef.current?.focus()
  }, [editorRef])

  useEffect(() => {
    if (!sidePanelOpened) {
      editorRef.current?.focus()
    }
  }, [sidePanelOpened, editorRef])

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
    <div className="relative size-full">
      <Monaco
        data-mask
        ref={editorRef}
        language={languageIds[dialect]}
        value={query}
        onChange={(next) => setQuery(store, next)}
        className="size-full"
        options={MONACO_OPTIONS}
      />
      {runAnchor && !editing && (
        <StatementControls
          anchor={runAnchor}
          editorRef={editorRef}
          failed={failed}
          menuRef={statementMenuRef}
        />
      )}
    </div>
  )
}
