import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { SUBSCRIPTION_PAST_DUE_MESSAGE } from '@tamery/shared/constants'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@tamery/ui/components/alert'
import { Badge } from '@tamery/ui/components/badge'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { smallItemInsetClassName } from '@tamery/ui/components/item'
import { Tabs, TabsList, TabsTrigger } from '@tamery/ui/components/tabs'
import { cn } from '@tamery/ui/lib/utils'
import { getRouteApi, useRouter } from '@tanstack/react-router'
import { format, formatDistanceToNow } from 'date-fns'
import { useState } from 'react'

import {
  useBillingPortal,
  useSubscription,
  useUpgradeSubscription,
} from '~/hooks/use-subscription'
import type { PricingPlan } from '~/utils/pricing'
import { getPriceUnit, HOBBY_PLAN, PRO_PLAN, TEAM_PLAN } from '~/utils/pricing'

import { TeamSeats } from './team-seats'

const { useSearch } = getRouteApi('/account/')

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 2,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    style: 'currency',
  }).format(amount)

const getPlanDescription = (
  plan: PricingPlan,
  subscription: ReturnType<typeof useSubscription>
) => {
  if (!subscription) {
    return `${plan.description}. Starts with a 7-day free trial.`
  }
  if (plan.id === subscription.plan && !subscription.isOwner) {
    return 'Your team pays for your seat.'
  }
  return plan.description
}

const getStatus = (
  subscription: NonNullable<ReturnType<typeof useSubscription>>,
  trialEndsLater: boolean
) => {
  if (subscription.cancelAt) {
    return `Cancels on ${format(subscription.cancelAt, 'MMM d, yyyy')}`
  }
  if (subscription.cancelAtPeriodEnd) {
    return 'Cancels at the end of this period'
  }
  if (
    subscription.status === 'trialing' &&
    trialEndsLater &&
    subscription.trialEnd
  ) {
    return `Free trial ends ${formatDistanceToNow(subscription.trialEnd, { addSuffix: true })}`
  }
  if (subscription.periodEnd) {
    return `Next payment on ${format(subscription.periodEnd, 'MMM d, yyyy')}`
  }
  return 'No upcoming payment'
}

export const Subscription = () => {
  const { period, type: clientType } = useSearch()
  const subscription = useSubscription()
  const router = useRouter()
  const returnHref = router.buildLocation({
    search: { type: clientType },
    to: '/account',
  }).href
  const { openBillingPortal, isOpening } = useBillingPortal({ returnHref })
  const { upgrade, isUpgrading } = useUpgradeSubscription(clientType)
  const [isYearly, setIsYearly] = useState(period === 'yearly')
  // oxlint-disable-next-line react/hook-use-state -- frozen at mount, never set
  const [mountedAt] = useState(() => Date.now())
  const trialEndsLater = Boolean(
    subscription?.trialEnd && subscription.trialEnd.getTime() > mountedAt
  )

  const shownPeriod = subscription?.period ?? (isYearly ? 'yearly' : 'monthly')

  return (
    <>
      {subscription?.isOwner && subscription.status === 'past_due' && (
        <Alert variant="destructive">
          <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
          <AlertTitle>Payment issue with your subscription</AlertTitle>
          <AlertDescription>{SUBSCRIPTION_PAST_DUE_MESSAGE}</AlertDescription>
        </Alert>
      )}
      <SettingsGroup title="Plan">
        <SettingsRow
          title={HOBBY_PLAN.name}
          description={HOBBY_PLAN.description}
        >
          {!subscription && <Badge variant="secondary">Current</Badge>}
        </SettingsRow>
        {[PRO_PLAN, TEAM_PLAN].map((plan) => {
          const current = subscription?.plan === plan.id ? subscription : null

          return (
            <SettingsRow
              key={plan.id}
              title={
                <span className="flex items-baseline gap-2">
                  {plan.name}
                  <span className="text-muted-foreground text-xs font-normal">
                    {`${formatCurrency(current?.price ?? plan.price[shownPeriod])} ${getPriceUnit(plan, shownPeriod)}`}
                  </span>
                </span>
              }
              description={getPlanDescription(plan, subscription)}
            >
              {current && <Badge variant="secondary">Current</Badge>}
              {!subscription && (
                <Button
                  size="sm"
                  variant={plan === PRO_PLAN ? 'default' : 'outline'}
                  disabled={isUpgrading}
                  onClick={() => upgrade({ isYearly, plan: plan.id })}
                >
                  Upgrade
                </Button>
              )}
              {plan === TEAM_PLAN &&
                subscription?.isOwner &&
                subscription.plan === 'pro' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isOpening}
                    onClick={() => openBillingPortal({ changePlan: true })}
                  >
                    Switch to Team
                  </Button>
                )}
            </SettingsRow>
          )
        })}
        {!subscription && (
          <SettingsRow
            title="Billing period"
            description="Yearly gives you 2 months free."
          >
            <Tabs
              value={isYearly ? 'yearly' : 'monthly'}
              onValueChange={(value) => setIsYearly(value === 'yearly')}
            >
              <TabsList>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
                <TabsTrigger value="yearly">Yearly</TabsTrigger>
              </TabsList>
            </Tabs>
          </SettingsRow>
        )}
      </SettingsGroup>
      {subscription?.isOwner && subscription.plan === 'team' && (
        <TeamSeats
          seats={subscription.seats}
          isChangingSeats={isOpening}
          onChangeSeats={() => openBillingPortal({ changePlan: true })}
        />
      )}
      {subscription?.isOwner && (
        <SettingsGroup title="Billing">
          <SettingsRow
            title={getStatus(subscription, trialEndsLater)}
            description="Change your plan or payment method, or cancel, in the billing portal."
          >
            <Button
              variant="outline"
              size="sm"
              disabled={isOpening}
              onClick={() => openBillingPortal()}
            >
              <LoadingContent loading={isOpening}>Manage</LoadingContent>
            </Button>
          </SettingsRow>
        </SettingsGroup>
      )}
      <p
        className={cn(
          smallItemInsetClassName,
          'text-muted-foreground text-xs text-pretty'
        )}
      >
        Tamery is independent and funded by its users, with no investors. Your
        subscription pays for its development. Thank you.
      </p>
    </>
  )
}
