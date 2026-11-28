import { FREE_WEEKLY_LIMITS, usageResetsAt } from '@tamery/shared/usage'
import { Button } from '@tamery/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tamery/ui/components/dialog'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { useSubscription } from 'seitu/react'

import { limitDialog } from './usage'

const close = () => limitDialog.set({ open: false })

export const LimitDialog = () => {
  const { open } = useSubscription(limitDialog)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => limitDialog.set({ open: next })}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Agents used this week&rsquo;s queries</DialogTitle>
          <DialogDescription>
            The free plan includes {FREE_WEEKLY_LIMITS.mcp} agent queries a week
            through MCP. They come back on{' '}
            {format(usageResetsAt(), 'EEEE, MMMM d')}, or upgrade to Pro for no
            limit.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Later
          </Button>
          <Button
            render={
              <Link to="/settings/$section" params={{ section: 'plan' }} />
            }
            onClick={close}
          >
            Upgrade to Pro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
