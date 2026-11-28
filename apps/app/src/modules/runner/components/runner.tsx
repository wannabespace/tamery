import {
  BrushCleaningIcon,
  SaveIcon,
  PanelBottomCloseIcon,
  PanelBottomOpenIcon,
  Bookmark02Icon,
  PlayIcon,
  StopIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { isSqlDialect } from '@tamery/shared/enums/connection-type'
import type { Statement } from '@tamery/sql'
import { statementAt } from '@tamery/sql'
import { Button } from '@tamery/ui/components/button'
import { ContentSwitch } from '@tamery/ui/components/custom/content-switch'
import {
  ResizableGroup,
  ResizablePanel,
  ResizableSeparator,
} from '@tamery/ui/components/custom/resizable'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@tamery/ui/components/popover'
import { Separator } from '@tamery/ui/components/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { count, eq, useLiveQuery } from '@tanstack/react-db'
import { useQuery } from '@tanstack/react-query'
import type { editor } from 'monaco-editor'
import { Range } from 'monaco-editor'
import type { ComponentRef } from 'react'
import { useRef, useState } from 'react'
import { useSubscription } from 'seitu/react'
import { toast } from 'sonner'

import { useCollections } from '~/core/collections'
import { useTabContext } from '~/core/connection/route'
import { wrapExplainQuery } from '~/core/connection/utils'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { useShortcuts } from '~/core/keyboard/use-shortcuts'
import { getQueryLanguage } from '~/core/runtime/language'
import { checkOrUpgrade } from '~/core/user/permissions'
import { formatSql } from '~/utils/formatter'

import type { RunnerActions } from '../lib/actions'
import { RunnerActionsContext } from '../lib/actions'
import type { RunnerStatement } from '../lib/run'
import { runnerResultsOptions, runStatements, stopRun } from '../lib/run'
import {
  RUNNER_RESULTS_DEFAULT_HEIGHT,
  RUNNER_RESULTS_MAX_HEIGHT,
  RUNNER_RESULTS_MIN_HEIGHT,
  runnerStatements,
  setLayout,
  setQuery,
  useRunnerPageStore,
  useRunnerTab,
} from '../lib/store'
import { runnerTransaction } from '../lib/transaction'
import { RunHistoryButton } from './run-history'
import { useAiEdit } from './runner-ai-edit'
import { RunnerAlertDialog } from './runner-alert-dialog'
import { RunnerEditor } from './runner-editor'
import { RunnerResults } from './runner-results'
import { RunnerSaveDialog } from './runner-save-dialog'
import { SavedQueries } from './saved-queries'
import { TransactionControls } from './transaction-controls'

const toRunnerStatement = (
  statement: Statement,
  offset = 0
): RunnerStatement => ({
  end: offset + statement.end,
  source: statement.text,
  start: offset + statement.start,
  text: statement.text,
})

const ToolbarButton = ({
  label,
  shortcut,
  ...props
}: React.ComponentProps<typeof Button> & {
  label: string
  shortcut?: React.ReactNode
}) => (
  <Tooltip shortcut={shortcut}>
    <TooltipTrigger
      render={
        <Button
          variant="ghost-muted"
          size="icon-sm"
          aria-label={label}
          {...props}
        />
      }
    />
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
)

const SavedQueriesButton = () => {
  const { connectionResource } = useTabContext()
  const { queriesCollection } = useCollections()
  const { data: { queriesCount } = { queriesCount: 0 } } = useLiveQuery({
    query: (q) =>
      q
        .from({ queries: queriesCollection })
        .where(({ queries }) =>
          eq(queries.connectionResourceId, connectionResource.id)
        )
        .select(({ queries }) => ({ queriesCount: count(queries.id) }))
        .findOne(),
  })
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost-muted" size="sm" />}>
        <HugeiconsIcon icon={Bookmark02Icon} strokeWidth={2} />
        Saved
        {queriesCount > 0 && (
          <span className="text-muted-foreground/70">{queriesCount}</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" padding="none" className="w-80">
        <SavedQueries onPicked={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

export const Runner = () => {
  const { connection, connectionResource, dialect } = useTabContext()
  const tab = useRunnerTab()
  const store = useRunnerPageStore()
  const editorRef = useRef<editor.IStandaloneCodeEditor>(null)
  const alertDialogRef = useRef<ComponentRef<typeof RunnerAlertDialog>>(null)
  const saveDialogRef = useRef<ComponentRef<typeof RunnerSaveDialog>>(null)
  const [formatted, setFormatted] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const { resultsHeight, resultsVisible } = useSubscription(store, {
    selector: (state) => state.layout,
  })
  const { data: lastRun } = useQuery(runnerResultsOptions(tab))
  const running = lastRun?.running ?? false
  const statements = runnerStatements({ ...tab, dialect })
  const language = getQueryLanguage(dialect)
  const aiEdit = useAiEdit({
    connectionResourceId: connectionResource.id,
    connectionType: connection.type,
    editorRef,
  })

  const current = (): {
    statements: RunnerStatement[]
    range: Range | null
  } => {
    const codeEditor = editorRef.current
    const model = codeEditor?.getModel()
    const selection = codeEditor?.getSelection()
    const position = codeEditor?.getPosition()
    if (!model || !position) {
      return { range: null, statements: [] }
    }
    if (selection && !selection.isEmpty()) {
      const offset = model.getOffsetAt(selection.getStartPosition())
      return {
        range: selection,
        statements: language
          .split(model.getValueInRange(selection))
          .map((statement) => toRunnerStatement(statement, offset)),
      }
    }
    const statement = statementAt(
      statements.get(),
      model.getOffsetAt(position),
      model.getValue()
    )
    if (!statement) {
      return { range: null, statements: [] }
    }
    const turn = runnerTransaction.step({
      dialect,
      statement,
      tab,
      text: model.getValue(),
    })
    if (turn !== statement) {
      return {
        range: Range.fromPositions(
          model.getPositionAt(turn.start),
          model.getPositionAt(turn.end)
        ),
        statements: [toRunnerStatement(turn)],
      }
    }
    const getLine = (offset: number) => model.getPositionAt(offset).lineNumber
    const first = getLine(statement.start)
    const last = getLine(statement.terminatorEnd)
    const sameLines = statements
      .get()
      .filter(
        (item) =>
          getLine(item.start) <= last && getLine(item.terminatorEnd) >= first
      )
    return {
      range: Range.fromPositions(
        model.getPositionAt((sameLines[0] ?? statement).start),
        model.getPositionAt((sameLines.at(-1) ?? statement).end)
      ),
      statements: sameLines.map((item) => toRunnerStatement(item)),
    }
  }

  const run = (pending: RunnerStatement[]) => {
    if (pending.length === 0) {
      return
    }
    const start = () =>
      runStatements({
        connectionResource,
        statements: pending,
        tabId: tab.tabId,
      })
    const keywords = language.destructive(
      pending.map((statement) => statement.text).join(';\n')
    )
    if (keywords.length > 0) {
      alertDialogRef.current?.confirm(keywords, start)
    } else {
      start()
    }
  }

  const actions: RunnerActions = {
    askAi: () => {
      if (!checkOrUpgrade('ai.query.use')) {
        return
      }
      const { range } = current()
      if (range) {
        aiEdit.open(range)
      }
    },
    explainCurrent: () =>
      run(
        current().statements.flatMap((statement) =>
          (
            language.unwrapTransaction(statement.source)?.statements ?? [
              statement.source,
            ]
          ).map((text) => ({ ...statement, text: wrapExplainQuery(text) }))
        )
      ),
    fixWithAi: ({ end, error, source, start }) => {
      if (!checkOrUpgrade('ai.query.use')) {
        return
      }
      const model = editorRef.current?.getModel()
      if (!model || model.getValue().slice(start, end) !== source) {
        toast.error('The statement changed since it ran — run it again first')
        return
      }
      aiEdit.fix(
        Range.fromPositions(
          model.getPositionAt(start),
          model.getPositionAt(end)
        ),
        error.message
      )
    },
    focus: () => editorRef.current?.focus(),
    format: () => {
      setQuery(store, formatSql(store.get().query, dialect))
      setFormatted(true)
    },
    renameSaved: (query) =>
      saveDialogRef.current?.open({ kind: 'rename', query }),
    runAll: () =>
      run(statements.get().map((statement) => toRunnerStatement(statement))),
    runCurrent: () => run(current().statements),
    saveAll: () => {
      saveDialogRef.current?.open({
        kind: 'tab',
        sql: statements.get().length > 0 ? store.get().query : '',
      })
    },
    saveCurrent: () => {
      const sources = current().statements.map((statement) => statement.source)
      if (sources.length > 0) {
        saveDialogRef.current?.open({
          kind: 'statement',
          sql: sources.join(';\n\n'),
        })
      }
    },
  }

  useShortcuts(
    [
      {
        callback: (event) => {
          event.preventDefault()
          actions.runCurrent()
        },
        shortcut: 'runStatement',
      },
      {
        callback: (event) => {
          event.preventDefault()
          actions.runAll()
        },
        shortcut: 'runAll',
      },
    ],
    { enabled: !confirming }
  )

  return (
    <RunnerActionsContext value={actions}>
      <ResizableGroup orientation="vertical">
        <ResizablePanel className="flex min-h-0 flex-col">
          <div className="flex shrink-0 items-center gap-2 px-3 py-2">
            {running ? (
              <Button size="sm" variant="outline" onClick={() => stopRun(tab)}>
                <HugeiconsIcon icon={StopIcon} strokeWidth={2} />
                Stop
              </Button>
            ) : (
              <Tooltip shortcut={<ShortcutKbd shortcut="runAll" />}>
                <TooltipTrigger
                  render={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => actions.runAll()}
                    />
                  }
                >
                  <HugeiconsIcon icon={PlayIcon} strokeWidth={2} />
                  Run all
                </TooltipTrigger>
                <TooltipContent>Run every statement</TooltipContent>
              </Tooltip>
            )}
            <TransactionControls disabled={running} />
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {isSqlDialect(dialect) && (
                <ToolbarButton label="Format" onClick={() => actions.format()}>
                  <ContentSwitch
                    active={formatted}
                    activeContent={
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        strokeWidth={2}
                        className="text-success"
                      />
                    }
                    onSwitchEnd={() => setFormatted(false)}
                  >
                    <HugeiconsIcon icon={BrushCleaningIcon} strokeWidth={2} />
                  </ContentSwitch>
                </ToolbarButton>
              )}
              <ToolbarButton
                label="Save tab as query"
                shortcut={<ShortcutKbd shortcut="saveTab" />}
                onClick={() => actions.saveAll()}
              >
                <HugeiconsIcon icon={SaveIcon} strokeWidth={2} />
              </ToolbarButton>
              <Separator orientation="vertical" className="mx-0.5 h-4!" />
              <RunHistoryButton />
              <SavedQueriesButton />
              <Separator orientation="vertical" className="mx-0.5 h-4!" />
              <ToolbarButton
                label={resultsVisible ? 'Hide results' : 'Show results'}
                onClick={() =>
                  setLayout(store, { resultsVisible: !resultsVisible })
                }
              >
                <HugeiconsIcon
                  icon={
                    resultsVisible ? PanelBottomCloseIcon : PanelBottomOpenIcon
                  }
                  strokeWidth={2}
                />
              </ToolbarButton>
            </div>
          </div>
          <div className="relative min-h-0 flex-1 border-t">
            <RunnerEditor
              editorRef={editorRef}
              editing={aiEdit.editing}
              reviewing={aiEdit.reviewing}
              acceptAi={aiEdit.accept}
              rejectAi={aiEdit.reject}
            />
          </div>
          <RunnerSaveDialog ref={saveDialogRef} />
          <RunnerAlertDialog
            ref={alertDialogRef}
            onOpenChange={setConfirming}
          />
        </ResizablePanel>
        <ResizableSeparator aria-label="Resize results" />
        <ResizablePanel
          size={resultsHeight}
          onSizeChange={(height) => setLayout(store, { resultsHeight: height })}
          defaultSize={RUNNER_RESULTS_DEFAULT_HEIGHT}
          minSize={RUNNER_RESULTS_MIN_HEIGHT}
          maxSize={RUNNER_RESULTS_MAX_HEIGHT}
          collapsed={!resultsVisible}
          onCollapsedChange={(collapsed) =>
            setLayout(store, { resultsVisible: !collapsed })
          }
        >
          <div className="size-full border-t">
            <RunnerResults />
          </div>
        </ResizablePanel>
      </ResizableGroup>
    </RunnerActionsContext>
  )
}
