import { Button } from '@tamery/ui/components/button'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { Link } from '@tanstack/react-router'

import { useSubscription } from '~/core/user/use-subscription'

import { AiUsage } from './ai-usage'
import { ProCredits } from './pro-credits'

export const AiCredits = () => {
  const { subscription, isLoading } = useSubscription()

  if (isLoading) {
    return null
  }

  return (
    <>
      {subscription ? (
        <ProCredits />
      ) : (
        <SettingsGroup title="AI credits">
          <SettingsRow
            title="AI credits come with Pro"
            description="Pro includes AI every month, and credits keep it going past that."
          >
            <Button
              variant="outline"
              size="sm"
              render={
                <Link to="/settings/$section" params={{ section: 'plan' }} />
              }
            >
              See Pro
            </Button>
          </SettingsRow>
        </SettingsGroup>
      )}
      <AiUsage />
    </>
  )
}
