import { getDialect } from '@tamery/shared/enums/connection-type'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tamery/ui/components/dialog'
import { useMutation } from '@tanstack/react-query'
import { createRef, useEffect, useImperativeHandle, useState } from 'react'
import { v7 as uuidv7 } from 'uuid'

import { getCapabilities } from '~/core/catalog/capabilities'
import { canQueryConnection } from '~/core/connection/fetching'
import { refreshCatalog } from '~/core/connection/refresh-after-run'
import { connectionResourceToQueryParams } from '~/core/runtime/query'

import type { CopyEnd } from './copy-end-label'
import { CopyEndLabel } from './copy-end-label'
import { CopyForm } from './copy-form'
import type { CopyLogLine } from './copy-log-line'
import {
  appendCopyLog,
  parseCopyLogLine,
  toFailureEntries,
} from './copy-log-line'
import type { CopyStatus } from './copy-progress'
import { CopyProgress } from './copy-progress'
import { CopyRoute } from './copy-route'
import type { TableSelection } from './tables-field'

interface CopyRun {
  id: string
  source: CopyEnd
  stop: AbortController
  tables: TableSelection
  target: CopyEnd
}

export const copyDatabaseDialogRef = createRef<{
  open: (source: CopyEnd) => void
}>()

export const getCopyDatabaseAction = (source: CopyEnd | null) =>
  window.electron &&
  source &&
  getCapabilities(getDialect(source.connection.type)).flags.includes(
    'copyDatabase'
  ) &&
  canQueryConnection(source.connection)
    ? () => copyDatabaseDialogRef.current?.open(source)
    : null

const startCopy = async (run: CopyRun) => {
  const [from, to] = await Promise.all([
    connectionResourceToQueryParams(run.source.resource),
    connectionResourceToQueryParams(run.target.resource),
  ])
  run.stop.signal.throwIfAborted()
  run.stop.signal.addEventListener('abort', () => {
    void window.electron?.copyDatabase.cancel(run.id)
  })
  await window.electron?.copyDatabase.start({
    id: run.id,
    source: from.connectionString,
    tables: run.tables && [...run.tables.values()],
    target: to.connectionString,
  })
  return Date.now()
}

export const CopyDatabaseDialog = () => {
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<CopyEnd | null>(null)
  const [target, setTarget] = useState<CopyEnd | null>(null)
  const [selection, setSelection] = useState<TableSelection>(null)
  const [entries, setEntries] = useState<CopyLogLine[]>([])

  const copy = useMutation({
    meta: { event: 'database_copied' },
    mutationFn: startCopy,
    onError: (error, run) => {
      if (!run.stop.signal.aborted) {
        setEntries((previous) =>
          appendCopyLog(previous, toFailureEntries(error))
        )
      }
    },
    onMutate: () => setEntries([]),
    onSuccess: (_, run) => refreshCatalog(run.target.resource),
  })

  const runId = copy.variables?.id
  // Electron delivers a run's last lines after its result, so the log listens for as long as the run is shown, not until it settles.
  useEffect(
    () =>
      window.electron?.copyDatabase.onLog(({ copyId, line }) => {
        const entry = copyId === runId && parseCopyLogLine(line)
        if (entry) {
          setEntries((previous) => appendCopyLog(previous, [entry]))
        }
      }),
    [runId]
  )

  useImperativeHandle(copyDatabaseDialogRef, () => ({
    open: (next) => {
      copy.reset()
      setSource(next)
      setTarget(null)
      setSelection(null)
      setOpen(true)
    },
  }))

  const stop = () => copy.variables?.stop.abort()

  let status: CopyStatus = 'copying'
  if (copy.isSuccess) {
    status = 'copied'
  } else if (copy.isError) {
    status = copy.variables?.stop.signal.aborted ? 'stopped' : 'failed'
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (copy.isPending) {
          stop()
        } else {
          setOpen(next)
        }
      }}
    >
      {source && (
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Copy database</DialogTitle>
            <DialogDescription>
              {copy.variables ? (
                <CopyRoute
                  source={source}
                  status={status}
                  target={copy.variables.target}
                />
              ) : (
                <CopyEndLabel {...source} />
              )}
            </DialogDescription>
          </DialogHeader>
          {copy.variables ? (
            <CopyProgress
              entries={entries}
              since={copy.submittedAt}
              copiedAt={copy.data ?? null}
              status={status}
              onBack={() => copy.reset()}
              onStop={stop}
            />
          ) : (
            <CopyForm
              source={source}
              target={target}
              selection={selection}
              onTargetChange={setTarget}
              onSelectionChange={setSelection}
              onSubmit={(picked) =>
                copy.mutate({
                  id: uuidv7(),
                  source,
                  stop: new AbortController(),
                  tables: selection,
                  target: picked,
                })
              }
            />
          )}
        </DialogContent>
      )}
    </Dialog>
  )
}
