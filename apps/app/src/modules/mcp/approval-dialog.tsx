import { getDialect } from '@tamery/shared/enums/connection-type'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tamery/ui/components/alert-dialog'
import { CodeBlock } from '@tamery/ui/components/custom/code-block'
import { useRef, useState } from 'react'
import { useSubscription } from 'seitu/react'

import { WriteEstimate } from '~/core/agent/write-estimate'
import { getQueryLanguage } from '~/core/runtime/language'

import { approval } from './approval'

export const ApprovalDialog = () => {
  const [pending] = useSubscription(approval.store, {
    selector: (state) => state.pending,
  })
  const [item, setItem] = useState(pending)
  if (pending && pending !== item) {
    setItem(pending)
  }
  const declineRef = useRef<HTMLButtonElement>(null)

  return (
    <AlertDialog
      open={!!pending}
      onOpenChange={(open) => {
        if (!open) {
          pending?.decide(false)
        }
      }}
      onOpenChangeComplete={(open) => {
        if (!open) {
          setItem(undefined)
        }
      }}
    >
      {item && (
        <AlertDialogContent
          key={item.id}
          initialFocus={declineRef}
          className="sm:max-w-lg"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Run this statement?</AlertDialogTitle>
            <AlertDialogDescription>
              An agent wants to run it on{' '}
              <span data-mask className="text-foreground font-medium">
                {item.connection.name}
              </span>
              {item.resourceName && (
                <>
                  , database{' '}
                  <span data-mask className="text-foreground font-medium">
                    {item.resourceName}
                  </span>
                  ,
                </>
              )}{' '}
              through MCP. It commits and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <CodeBlock
            code={item.sql}
            language={
              getQueryLanguage(getDialect(item.connection.type)).highlight
            }
            size="xs"
            variant="field"
            wrap
            className="max-h-60"
          />
          {item.estimate !== null && <WriteEstimate rows={item.estimate} />}
          <AlertDialogFooter>
            <AlertDialogCancel ref={declineRef}>Decline</AlertDialogCancel>
            <AlertDialogAction
              variant={item.kind === 'destructive' ? 'destructive' : 'warning'}
              onClick={() => item.decide(true)}
            >
              Run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  )
}
