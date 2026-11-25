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
import { getPriceUnit, HOBBY_PLAN, PAID_PLANS, PRO_PLAN } from '~/utils/pricing'

import { TeamSeats } from './team-seats'

const { useSearch } = getRouteApi('/account/')

type OwnSubscription = Extract<
  NonNullable<ReturnType<typeof useSubscription>>,
  { isOwner: true }
>

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

const getStatus = (subscription: OwnSubscription, trialEndsLater: boolean) => {
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
  const { period, plan: chosenPlan, type: clientType } = useSearch()
  const subscription = useSubscription()
  const ownSubscription = subscription?.isOwner ? subscription : null
  const router = useRouter()
  const returnHref = router.buildLocation({
    search: { type: clientType },
    to: '/account',
  }).href
  const { openBillingPortal, isOpening, openingIntent } = useBillingPortal({
    returnHref,
  })
  const { upgrade, upgradingPlan } = useUpgradeSubscription(clientType)
  const [isYearly, setIsYearly] = useState(period === 'yearly')
  // oxlint-disable-next-line react/hook-use-state -- frozen at mount, never set
  const [mountedAt] = useState(() => Date.now())
  const trialEndsLater = Boolean(
    ownSubscription?.trialEnd && ownSubscription.trialEnd.getTime() > mountedAt
  )

  const shownPeriod =
    ownSubscription?.period ?? (isYearly ? 'yearly' : 'monthly')
  const primaryPlan = chosenPlan ?? PRO_PLAN.id

  return (
    <>
      {ownSubscription?.status === 'past_due' && (
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
        {PAID_PLANS.map((plan) => {
          const isCurrent = subscription?.plan === plan.id

          return (
            <SettingsRow
              key={plan.id}
              title={
                <span className="flex items-baseline gap-2">
                  {plan.name}
                  <span className="text-muted-foreground text-xs font-normal">
                    {`${formatCurrency(isCurrent && ownSubscription ? ownSubscription.price : plan.price[shownPeriod])} ${getPriceUnit(plan, shownPeriod)}`}
                  </span>
                </span>
              }
              description={getPlanDescription(plan, subscription)}
            >
              {isCurrent && <Badge variant="secondary">Current</Badge>}
              {!subscription && (
                <Button
                  size="sm"
                  variant={plan.id === primaryPlan ? 'default' : 'outline'}
                  disabled={upgradingPlan !== null}
                  onClick={() => upgrade({ isYearly, plan: plan.id })}
                >
                  <LoadingContent loading={upgradingPlan === plan.id}>
                    Upgrade
                  </LoadingContent>
                </Button>
              )}
              {plan.perSeat && ownSubscription?.plan === 'pro' && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isOpening}
                  onClick={() => openBillingPortal('switch_to_team')}
                >
                  <LoadingContent loading={openingIntent === 'switch_to_team'}>
                    Switch to Team
                  </LoadingContent>
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
      {ownSubscription?.plan === 'team' && (
        <TeamSeats
          assignableSeats={ownSubscription.assignableSeats}
          isTrial={ownSubscription.status === 'trialing'}
          seats={ownSubscription.seats}
          isChangingSeats={openingIntent === 'change_seats'}
          isOpeningPortal={isOpening}
          onChangeSeats={() => openBillingPortal('change_seats')}
        />
      )}
      {ownSubscription && (
        <SettingsGroup title="Billing">
          <SettingsRow
            title={getStatus(ownSubscription, trialEndsLater)}
            description="Change your plan or payment method, or cancel, in the billing portal."
          >
            <Button
              variant="outline"
              size="sm"
              disabled={isOpening}
              onClick={() => openBillingPortal('manage')}
            >
              <LoadingContent loading={openingIntent === 'manage'}>
                Manage
              </LoadingContent>
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
