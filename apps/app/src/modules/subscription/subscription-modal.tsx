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
import { useEffect } from 'react'
import { useSubscription } from 'seitu/react'
import { toast } from 'sonner'

import { useSubscription as useUserSubscription } from '~/core/user/use-subscription'
import { posthog } from '~/lib/posthog'
import { appStore, setIsSubscriptionDialogOpen } from '~/store'

export const SubscriptionModal = () => {
  const { isSubscriptionDialogOpen, offerAiKey, upgradeHint } = useSubscription(
    appStore,
    {
      selector: (state) => ({
        isSubscriptionDialogOpen: state.isSubscriptionDialogOpen,
        offerAiKey: state.offerAiKey,
        upgradeHint: state.upgradeHint,
      }),
    }
  )
  const { subscription } = useUserSubscription()

  useEffect(() => {
    if (isSubscriptionDialogOpen && subscription) {
      setIsSubscriptionDialogOpen(false)
      posthog.capture('subscription_started')
      toast.success(
        'Subscription successful! Tamery Pro features are now unlocked.'
      )
    }
  }, [isSubscriptionDialogOpen, subscription])

  return (
    <Dialog
      open={isSubscriptionDialogOpen}
      onOpenChange={(open) => setIsSubscriptionDialogOpen(open)}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {upgradeHint
              ? 'You reached the Free limit'
              : 'This one is part of Pro'}
          </DialogTitle>
          <DialogDescription>
            {upgradeHint ??
              (offerAiKey
                ? 'Upgrade to unlock this and everything else, or add your own Anthropic, OpenAI, Google or OpenRouter key to use the AI chat on the Free plan, billed by your provider.'
                : 'Upgrade to unlock this and everything else. Tamery is independent, and your support is what keeps it going.')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {offerAiKey ? (
            <Button
              variant="outline"
              render={
                <Link to="/settings/$section" params={{ section: 'ai' }} />
              }
              onClick={() => setIsSubscriptionDialogOpen(false)}
            >
              Add Your Key
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => setIsSubscriptionDialogOpen(false)}
            >
              Maybe Later
            </Button>
          )}
          <Button
            render={
              <Link to="/settings/$section" params={{ section: 'plan' }} />
            }
            onClick={() => setIsSubscriptionDialogOpen(false)}
          >
            Upgrade to Pro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
