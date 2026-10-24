import { toError } from '@tamery/shared/utils'
import { useMutation } from '@tanstack/react-query'
import { Result } from 'better-result'
import { useState } from 'react'
import { toast } from 'sonner'

import { getCapabilities } from '~/core/catalog/capabilities'
import { useConnectionContext } from '~/core/connection/route'
import { insertQuery } from '~/core/queries/rows/insert'
import { resourceRowsQueryKey } from '~/core/queries/rows/list'
import { setQuery } from '~/core/queries/rows/set'
import { rowIdentity } from '~/core/queries/rows/shape'
import {
  keyedRowsCountQuery,
  resourceTableTotalQueryKey,
} from '~/core/queries/rows/total'
import {
  connectionResourceToQueryParams,
  transaction,
} from '~/core/runtime/query'
import type { Draft, NewRow, PrimaryKeys } from '~/core/table/session'
import {
  draftsActions,
  newRowsActions,
  primaryKeysKey,
  stagedActions,
  useTableSessionStore,
} from '~/core/table/session'
import { queryClient } from '~/lib/query-client'
import { plural } from '~/utils/plural'

import { useTableColumnsContext } from './columns'
import { tableGridRef } from './grid-ref'
import { stagedHistory } from './history'

interface Submitted {
  drafts: Draft[]
  newRows: NewRow[]
}

class SaveError extends Error {
  override name = 'SaveError'
  readonly target:
    | { kind: 'row'; primaryKeys: PrimaryKeys }
    | { kind: 'new'; id: string }

  constructor(cause: unknown, target: SaveError['target']) {
    super(toError(cause).message, { cause })
    this.target = target
  }
}

const failingAs =
  (target: SaveError['target']) =>
  (error: unknown): never => {
    throw new SaveError(error, target)
  }

const getUpdates = (drafts: Draft[]) => {
  const updates = new Map<
    string,
    { primaryKeys: PrimaryKeys; values: Record<string, unknown> }
  >()
  for (const { columnId, primaryKeys, value } of drafts) {
    const key = primaryKeysKey(primaryKeys)
    const update = updates.get(key) ?? { primaryKeys, values: {} }
    update.values[columnId] = value
    updates.set(key, update)
  }
  return updates.values()
}

export const useSaveStaged = ({
  onSaved,
  schema,
  table,
}: {
  onSaved: () => void
  schema: string
  table: string
}) => {
  const { connectionResource, dialect } = useConnectionContext()
  const sessionStore = useTableSessionStore()
  const { columns } = useTableColumnsContext()
  const [isCounting, setIsCounting] = useState(false)
  const [sharedKeys, setSharedKeys] = useState<{
    edited: number
    matched: number
    submitted: Submitted
  } | null>(null)
  const history = stagedHistory({ id: connectionResource.id, schema, table })
  const status = stagedActions(sessionStore)

  const mutation = useMutation({
    meta: { event: 'row_changes_saved' },
    mutationFn: async ({ drafts, newRows }: Submitted) => {
      const queryParams =
        await connectionResourceToQueryParams(connectionResource)
      await transaction(queryParams).execute(async (tx) => {
        for (const { primaryKeys, values } of getUpdates(drafts)) {
          // oxlint-disable-next-line no-await-in-loop
          await setQuery({ columns, primaryKeys, schema, table, values })
            .run(queryParams, tx)
            .catch(failingAs({ kind: 'row', primaryKeys }))
        }
        // Staged rows list the newest first; insert them in the order they were added.
        for (const { id, values } of newRows.toReversed()) {
          // oxlint-disable-next-line no-await-in-loop
          await insertQuery({ columns, rows: [values], schema, table })
            .run(queryParams, tx)
            .catch(failingAs({ id, kind: 'new' }))
        }
      })
    },
    onError: (error) => {
      if (error instanceof SaveError) {
        if (error.target.kind === 'row') {
          draftsActions(sessionStore).setRowStatus(error.target.primaryKeys, {
            error: error.message,
          })
        } else {
          newRowsActions(sessionStore).setStatus(error.target.id, {
            error: error.message,
          })
        }
      }
      toast.error('Failed to save changes', {
        description: error.message,
        duration: 6000,
      })
    },
    onMutate: () => status.setStatus({ error: undefined, isCommitting: true }),
    onSettled: () => status.setStatus({ isCommitting: false }),
    onSuccess: async (_, submitted) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: resourceRowsQueryKey({ connectionResource, schema, table }),
        }),
        submitted.newRows.length > 0 &&
          queryClient.invalidateQueries({
            queryKey: resourceTableTotalQueryKey({
              connectionResource,
              schema,
              table,
            }),
          }),
      ])
      status.settle(submitted)
      history.reset()
      const rows = new Set(
        submitted.drafts.map((draft) => primaryKeysKey(draft.primaryKeys))
      )
      toast.success(
        `Saved ${plural(rows.size + submitted.newRows.length, getCapabilities(dialect).names.row)}`
      )
      onSaved()
    },
  })

  const submit = async (submitted: Submitted) => {
    const keys = Array.from(
      getUpdates(submitted.drafts),
      ({ primaryKeys }) => primaryKeys
    )
    if (rowIdentity(columns, dialect).unique || keys.length === 0) {
      mutation.mutate(submitted)
      return
    }
    setIsCounting(true)
    const matched = await Result.tryPromise(async () =>
      keyedRowsCountQuery({ columns, primaryKeys: keys, schema, table }).run(
        await connectionResourceToQueryParams(connectionResource)
      )
    )
    setIsCounting(false)
    if (matched.isErr()) {
      toast.error('Failed to save changes', {
        description: toError(matched.error.cause).message,
      })
    } else if (matched.value < keys.length) {
      toast.error('Failed to save changes', {
        description:
          'Some edited rows are no longer in the table. Refresh it and try again.',
      })
    } else if (matched.value > keys.length) {
      setSharedKeys({ edited: keys.length, matched: matched.value, submitted })
    } else {
      mutation.mutate(submitted)
    }
  }

  return {
    isSaving: mutation.isPending || isCounting,
    save: () => {
      if (tableGridRef.current?.commit() === false) {
        return
      }
      const { drafts, newRows } = sessionStore.get()
      if (Object.keys(drafts).length > 0 || newRows.length > 0) {
        void submit({ drafts: Object.values(drafts), newRows })
      }
    },
    /** The edited rows' keys also match other rows, which the save would change too. */
    sharedKeys: sharedKeys && {
      cancel: () => setSharedKeys(null),
      confirm: () => {
        mutation.mutate(sharedKeys.submitted)
        setSharedKeys(null)
      },
      edited: sharedKeys.edited,
      matched: sharedKeys.matched,
    },
  }
}
