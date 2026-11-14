import { silently } from '@tamery/shared/utils'
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
import { InlineCode } from '@tamery/ui/components/custom/inline-code'
import { useRef, useState } from 'react'
import { useSubscription } from 'seitu/react'

import { bridge } from '~/core/runtime/bridge/bridge'
import { bridgeHostKeys } from '~/core/runtime/bridge/host-keys'

export const HostKeyDialog = () => {
  const pending = useSubscription(bridgeHostKeys.store, {
    selector: (keys) => keys[0] ?? null,
  })
  const [shown, setShown] = useState(pending)
  if (pending && pending !== shown) {
    setShown(pending)
  }
  const cancelRef = useRef<HTMLButtonElement>(null)
  const answer = (trusted: boolean) =>
    pending && silently(() => bridge.answerHostKey(pending.id, trusted))

  return (
    <AlertDialog
      open={!!pending}
      onOpenChange={(open) => !open && answer(false)}
      onOpenChangeComplete={(open) => !open && setShown(null)}
    >
      {shown && (
        <AlertDialogContent key={shown.id} initialFocus={cancelRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Trust the SSH host <span data-mask>{shown.host}</span>?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Its {shown.keyType} key fingerprint is{' '}
              <InlineCode data-mask>{shown.fingerprint}</InlineCode>. Connect
              only if this matches the server’s key. The bridge adds it to{' '}
              <InlineCode>~/.ssh/known_hosts</InlineCode>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="warning" onClick={() => answer(true)}>
              Trust and Connect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  )
}
