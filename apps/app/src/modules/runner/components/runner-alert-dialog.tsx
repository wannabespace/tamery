import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tamery/ui/components/alert-dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useImperativeHandle, useRef, useState } from 'react'

import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { useShortcuts } from '~/core/keyboard/use-shortcuts'

export const RunnerAlertDialog = ({
  ref,
  onOpenChange,
}: {
  ref: React.RefObject<{
    confirm: (keywords: string[], onConfirmed: () => void) => void
  } | null>
  /** The runner turns its own ⌘↩ and ⇧⌘↩ off while this is open, or one press would confirm and ask again. */
  onOpenChange?: (open: boolean) => void
}) => {
  const [open, setOpen] = useState(false)
  const changeOpen = (next: boolean) => {
    setOpen(next)
    onOpenChange?.(next)
  }
  const [keywords, setKeywords] = useState<string[]>([])
  const callbackRef = useRef<() => void>(null)
  const [popup, setPopup] = useState<HTMLDivElement | null>(null)

  useImperativeHandle(ref, () => ({
    confirm: (pendingKeywords, onConfirmed) => {
      setKeywords(pendingKeywords)
      changeOpen(true)
      callbackRef.current = onConfirmed
    },
  }))

  const onConfirm = () => {
    callbackRef.current?.()
    changeOpen(false)
  }

  useShortcuts(popup ? [{ callback: onConfirm, shortcut: 'submit' }] : [], {
    target: popup,
  })

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        changeOpen(nextOpen)
        if (!nextOpen) {
          callbackRef.current = null
        }
      }}
    >
      <AlertDialogContent ref={setPopup}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center">
            <HugeiconsIcon
              icon={Alert02Icon}
              strokeWidth={2}
              className="text-warning mr-2 size-5"
            />
            This changes data
          </AlertDialogTitle>
          <AlertDialogDescription>
            This runs{' '}
            <span className="text-warning font-semibold">
              {keywords.join(', ')}
            </span>
            , which can modify or delete data in the database.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">Cancel</AlertDialogCancel>
          <Tooltip shortcut={<ShortcutKbd shortcut="submit" />}>
            <TooltipTrigger
              render={
                <AlertDialogCancel variant="warning" onClick={onConfirm} />
              }
            >
              Run anyway
            </TooltipTrigger>
            <TooltipContent>Run the statements</TooltipContent>
          </Tooltip>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
