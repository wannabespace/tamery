import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@tamery/ui/components/alert'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tamery/ui/components/dialog'
import { Input } from '@tamery/ui/components/input'
import { Label } from '@tamery/ui/components/label'
import { Switch } from '@tamery/ui/components/switch'
import { useMutation } from '@tanstack/react-query'
import { useParams, useRouter } from '@tanstack/react-router'
import { useImperativeHandle, useState } from 'react'
import { toast } from 'sonner'

import { OptionField } from '~/components/option-field'
import { getCapabilities } from '~/core/catalog/capabilities'
import type { TableType } from '~/core/catalog/table-type'
import { getTableTypeLabel } from '~/core/catalog/table-type'
import { useConnectionContext } from '~/core/connection/route'
import { dropTableQuery } from '~/core/queries/tables/drop'
import { dropViewQuery } from '~/core/queries/views/drop'
import { connectionResourceToQueryParams } from '~/core/runtime/query'
import { tableTabId } from '~/core/tabs/ids'
import { queryClient } from '~/lib/query-client'

import { pinnedTable } from './pinned-tables'

const dropConsequence = {
  'materialized view': () =>
    'This will permanently delete the materialized view and the rows it stores. The tables it reads stay as they are.',
  table: (noun: string) =>
    `This will permanently delete the ${noun} and all its data from the database.`,
  view: () =>
    'This will permanently delete the view. The tables it reads stay as they are.',
} satisfies Record<TableType, (noun: string) => string>

interface DropTableDialogProps {
  ref: React.RefObject<{
    drop: (schema: string, table: string, type: TableType) => void
  } | null>
}

export const DropTableDialog = ({ ref }: DropTableDialogProps) => {
  const { connectionResource, dialect } = useConnectionContext()
  const { tabId: activeTabId } = useParams({ strict: false })
  const router = useRouter()
  const [confirmationText, setConfirmationText] = useState('')
  const [schema, setSchema] = useState('')
  const [table, setTable] = useState('')
  const [type, setType] = useState<TableType>('table')
  const [open, setOpen] = useState(false)
  const [cascade, setCascade] = useState(false)
  const isCurrentTable = activeTabId === tableTabId(schema, table)
  const label = getTableTypeLabel(dialect, type)
  const noun = label.toLowerCase()

  useImperativeHandle(ref, () => ({
    drop: (nextSchema, nextTable, nextType) => {
      setSchema(nextSchema)
      setTable(nextTable)
      setType(nextType)
      setConfirmationText('')
      setCascade(false)
      setOpen(true)
    },
  }))

  const { mutate: dropTable, isPending } = useMutation({
    meta: { event: type === 'table' ? 'table_dropped' : 'view_dropped' },
    mutationFn: async () => {
      await (
        type === 'table'
          ? dropTableQuery({ cascade, schema, table })
          : dropViewQuery({
              cascade,
              materialized: type === 'materialized view',
              schema,
              view: table,
            })
      ).run(await connectionResourceToQueryParams(connectionResource))
    },
    onError: (error) => {
      toast.error(`Failed to drop ${noun} "${error.message}".`)
    },
    onSuccess: async () => {
      toast.success(`${label} "${table}" successfully dropped`)
      setOpen(false)

      queryClient.invalidateQueries({
        queryKey: ['connection-resource', connectionResource.id],
      })

      // Before navigating: the resource index redirects back to the active tab while it is still listed.
      pinnedTable.remove(connectionResource.id, schema, table)
      if (isCurrentTable) {
        await router.navigate({
          params: { resourceId: connectionResource.id },
          to: '/connection/$resourceId',
        })
      }
    },
  })

  const canConfirm = confirmationText === table

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Drop {noun}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Alert variant="destructive">
            <HugeiconsIcon
              icon={Alert02Icon}
              strokeWidth={2}
              className="text-destructive size-5"
            />
            <AlertTitle>This action cannot be undone.</AlertTitle>
            <AlertDescription>{dropConsequence[type](noun)}</AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Label htmlFor="confirmation">
              <span>
                Type{' '}
                <span data-mask className="font-semibold">
                  {table}
                </span>{' '}
                to confirm
              </span>
            </Label>
            <Input
              id="confirmation"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              placeholder={table}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          {getCapabilities(dialect).flags.includes('cascade') && (
            <OptionField
              htmlFor="drop-table-cascade"
              title="Cascade"
              description={`Also drop the objects that depend on this ${noun}.`}
            >
              <Switch
                id="drop-table-cascade"
                size="sm"
                checked={cascade}
                onCheckedChange={setCascade}
              />
            </OptionField>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => dropTable()}
            disabled={!canConfirm || isPending}
          >
            <LoadingContent loading={isPending}>Drop {noun}</LoadingContent>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
