import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { CREDIT_TOP_UP } from '@tamery/shared/credits'
import { Alert, AlertDescription } from '@tamery/ui/components/alert'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { Switch } from '@tamery/ui/components/switch'
import { useMutation } from '@tanstack/react-query'

import type { ORPCOutputs } from '~/lib/orpc'
import { orpc } from '~/lib/orpc'
import { queryClient } from '~/lib/query-client'

import { DollarsField } from './dollars-field'

/** Off until the user turns it on; a failed charge turns it off and says so here. */
export const AutoTopUp = ({
  settings,
}: {
  settings: ORPCOutputs['account']['credits']['get']['autoTopUp']
}) => {
  const saved = {
    amount: settings.amount ?? CREDIT_TOP_UP.autoTopUpAmount,
    enabled: settings.enabled,
    threshold: settings.threshold ?? CREDIT_TOP_UP.autoTopUpThreshold,
  }
  const { mutate: save } = useMutation({
    meta: { event: 'ai_credits_auto_top_up_changed' },
    mutationFn: (change: Partial<typeof saved>) =>
      orpc.account.credits.setAutoTopUp.call({ ...saved, ...change }),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: orpc.account.credits.get.key(),
      }),
  })

  return (
    <SettingsGroup title="Auto top-up">
      {settings.failedAt && !settings.enabled && (
        <Alert variant="destructive">
          <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
          <AlertDescription>
            Auto top-up turned off because the last payment didn&apos;t go
            through. Check your card under Plan → Manage, then turn it back on.
          </AlertDescription>
        </Alert>
      )}
      <SettingsRow
        htmlFor="auto-top-up"
        title="Top up automatically"
        description="Charges the card you paid with, so the chat never stops mid-answer."
      >
        <Switch
          id="auto-top-up"
          size="sm"
          checked={saved.enabled}
          onCheckedChange={(enabled) => save({ enabled })}
        />
      </SettingsRow>
      <SettingsRow
        htmlFor="auto-top-up-threshold"
        title="When credits fall below"
      >
        <DollarsField
          id="auto-top-up-threshold"
          min={0}
          value={saved.threshold}
          onCommit={(threshold) => save({ threshold })}
        />
      </SettingsRow>
      <SettingsRow htmlFor="auto-top-up-amount" title="Add">
        <DollarsField
          id="auto-top-up-amount"
          min={CREDIT_TOP_UP.min}
          value={saved.amount}
          onCommit={(amount) => save({ amount })}
        />
      </SettingsRow>
    </SettingsGroup>
  )
}
