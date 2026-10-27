import { Button } from '@tamery/ui/components/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tamery/ui/components/dialog'
import {
  Field,
  FieldDescription,
  FieldLabel,
} from '@tamery/ui/components/field'
import { Input } from '@tamery/ui/components/input'
import { useImperativeHandle, useState } from 'react'
import { toast } from 'sonner'
import { v7 } from 'uuid'

import { mutateOffline, useCollections } from '~/core/collections'
import { useTabContext } from '~/core/connection/route'
import { posthog } from '~/lib/posthog'

import type { Query } from '../sync'

type SaveRequest =
  | { kind: 'statement'; sql: string }
  | { kind: 'tab'; sql: string }
  | { kind: 'rename'; query: Query }

const TITLES: Record<SaveRequest['kind'], string> = {
  rename: 'Rename saved query',
  statement: 'Save statement',
  tab: 'Save tab as query',
}

const DESCRIPTIONS: Record<SaveRequest['kind'], string> = {
  rename: 'Only the name changes. The SQL stays as it was saved.',
  statement:
    'Saves the statement at the caret as a new query. Open it later from Saved in the toolbar.',
  tab: 'Saves everything in this tab as one query for this connection. Open it later from Saved in the toolbar.',
}

export const RunnerSaveDialog = ({
  ref,
}: {
  ref: React.RefObject<{ open: (request: SaveRequest) => void } | null>
}) => {
  const { queriesCollection } = useCollections()
  const { connectionResource } = useTabContext()
  const [request, setRequest] = useState<SaveRequest | null>(null)
  const [name, setName] = useState('')
  const [open, setOpen] = useState(false)

  useImperativeHandle(ref, () => ({
    open: (next) => {
      setRequest(next)
      setName(next.kind === 'rename' ? next.query.name : '')
      setOpen(true)
    },
  }))

  const sql = request && request.kind !== 'rename' ? request.sql : ''
  const empty = request?.kind !== 'rename' && !sql.trim()
  const canConfirm = Boolean(name.trim()) && !empty

  const confirm = () => {
    if (request?.kind === 'rename') {
      mutateOffline(() =>
        queriesCollection.update(request.query.id, (draft) => {
          draft.name = name.trim()
          draft.updatedAt = new Date()
        })
      )
      posthog.capture('saved_query_renamed')
      toast.success(`Renamed to "${name.trim()}"`)
    } else {
      mutateOffline(() =>
        queriesCollection.insert({
          connectionResourceId: connectionResource.id,
          createdAt: new Date(),
          id: v7(),
          name: name.trim(),
          query: sql,
          updatedAt: new Date(),
        })
      )
      posthog.capture('query_saved')
      toast.success(`Saved "${name.trim()}"`)
    }
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{request ? TITLES[request.kind] : ''}</DialogTitle>
          <DialogDescription>
            {request ? DESCRIPTIONS[request.kind] : ''}
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="saved-query-name">Name</FieldLabel>
          <Input
            id="saved-query-name"
            data-mask
            value={name}
            placeholder="Active users this week"
            spellCheck={false}
            autoComplete="off"
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canConfirm) {
                confirm()
              }
            }}
          />
          {empty && (
            <FieldDescription>There is no SQL to save yet.</FieldDescription>
          )}
        </Field>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button disabled={!canConfirm} onClick={confirm}>
            {request?.kind === 'rename' ? 'Rename' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
