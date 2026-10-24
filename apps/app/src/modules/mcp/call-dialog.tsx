import { getDialect } from '@tamery/shared/enums/connection-type'
import { Alert, AlertDescription } from '@tamery/ui/components/alert'
import { CodeBlock } from '@tamery/ui/components/custom/code-block'
import { CopyIconButton } from '@tamery/ui/components/custom/copy-button'
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogTitle,
} from '@tamery/ui/components/dialog'

import { getQueryLanguage } from '~/core/runtime/language'
import { formatSql } from '~/utils/formatter'

import type { ActivityEntry } from './call-title'
import { CallTitle } from './call-title'

export const CallDialog = ({
  entry,
  onOpenChange,
  open,
}: {
  entry: ActivityEntry | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) => {
  const query = entry?.call.query

  return (
    <Dialog open={open} onOpenChange={onOpenChange} variant="panel">
      {entry && query && (
        <DialogContent showCloseButton={false}>
          <div className="flex h-12 shrink-0 items-center gap-1 border-b px-2">
            <DialogTitle className="mx-2 min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <CallTitle {...entry} />
              </span>
            </DialogTitle>
            <CopyIconButton label="Copy query" text={query} />
            <DialogCloseButton />
          </div>
          <CodeBlock
            // oxlint-disable-next-line shadcn/no-restyle -- the block sits flush under the title row
            className="no-scrollbar scroll-fade min-h-0 flex-1 py-2"
            code={
              entry.connection
                ? formatSql(query, getDialect(entry.connection.type))
                : query
            }
            language={
              entry.connection
                ? getQueryLanguage(getDialect(entry.connection.type)).highlight
                : 'sql'
            }
            lineNumbers
            size="xs"
            wrap
          />
          {entry.call.error && (
            <Alert variant="destructive" className="m-2 w-auto shrink-0">
              <AlertDescription data-mask className="wrap-break-word">
                {entry.call.error}
              </AlertDescription>
            </Alert>
          )}
        </DialogContent>
      )}
    </Dialog>
  )
}
