import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { SUBSCRIPTION_PAST_DUE_MESSAGE } from '@tamery/shared/constants'
import { PRO_TRIAL_DAYS } from '@tamery/shared/credits'
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
import { HOBBY_PLAN, PRO_PLAN } from '~/utils/pricing'

const { useSearch } = getRouteApi('/account/')

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 2,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    style: 'currency',
  }).format(amount)

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
  const proPrice = subscription
    ? subscription.price
    : PRO_PLAN.price[shownPeriod]

  return (
    <>
      {subscription?.status === 'past_due' && (
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
        <SettingsRow
          title={
            <span className="flex items-baseline gap-2">
              {PRO_PLAN.name}
              <span className="text-muted-foreground text-xs font-normal">
                {`${formatCurrency(proPrice)}${shownPeriod === 'yearly' ? '/year' : '/month'}`}
              </span>
            </span>
          }
          description={
            subscription
              ? PRO_PLAN.description
              : `${PRO_PLAN.description}. Starts with a ${PRO_TRIAL_DAYS}-day free trial.`
          }
        >
          {subscription ? (
            <Badge variant="secondary">Current</Badge>
          ) : (
            <Button
              size="sm"
              disabled={isUpgrading}
              onClick={() => upgrade(isYearly)}
            >
              <LoadingContent loading={isUpgrading}>Upgrade</LoadingContent>
            </Button>
          )}
        </SettingsRow>
        {!subscription && (
          <SettingsRow
            title="Billing period"
            description={`Yearly costs ${formatCurrency(PRO_PLAN.price.yearly)} instead of ${formatCurrency(PRO_PLAN.price.monthly * 12)}.`}
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
      {subscription && (
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
