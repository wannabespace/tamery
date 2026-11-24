import { Alert02Icon, ArrowUpRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { SUBSCRIPTION_PAST_DUE_MESSAGE } from '@tamery/shared/constants'
import { PRO_TRIAL_DAYS } from '@tamery/shared/credits'
import { HOBBY_PLAN, PRO_PLAN } from '@tamery/shared/plans'
import { uppercaseFirst } from '@tamery/shared/utils'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tamery/ui/components/table'
import { Tabs, TabsList, TabsTrigger } from '@tamery/ui/components/tabs'
import { cn } from '@tamery/ui/lib/utils'
import { useMutation, useQuery } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import { useState } from 'react'

import {
  subscriptionsQueryOptions,
  useSubscription,
} from '~/core/user/use-subscription'
import type { ORPCOutputs } from '~/lib/orpc'
import { orpc } from '~/lib/orpc'

import { openStripe, stripeReturnUrl } from './browser'

type Subscription = ORPCOutputs['account']['subscription']['list'][number]

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 2,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    style: 'currency',
  }).format(amount)

const getStatus = (subscription: Subscription, trialEndsLater: boolean) => {
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

const Plan = () => {
  const { subscription } = useSubscription()
  const { data: subscriptions } = useQuery(subscriptionsQueryOptions)
  const [isYearly, setIsYearly] = useState(false)
  const upgrade = useMutation({
    meta: { event: 'subscription_checkout_started' },
    mutationFn: (yearly: boolean) =>
      orpc.account.subscription.upgrade.call({
        cancelUrl: stripeReturnUrl('plan'),
        isYearly: yearly,
        returnUrl: stripeReturnUrl('plan'),
        successUrl: stripeReturnUrl('plan'),
      }),
    onSuccess: openStripe,
  })
  const portal = useMutation(
    orpc.account.subscription.billingPortal.mutationOptions({
      meta: { event: 'billing_portal_opened' },
      onSuccess: openStripe,
    })
  )
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
            subscriptions?.length === 0
              ? `${PRO_PLAN.description}. Starts with a ${PRO_TRIAL_DAYS}-day free trial.`
              : PRO_PLAN.description
          }
        >
          {subscription ? (
            <Badge variant="secondary">Current</Badge>
          ) : (
            <Button
              size="sm"
              disabled={upgrade.isPending}
              onClick={() => upgrade.mutate(isYearly)}
            >
              <LoadingContent loading={upgrade.isPending}>
                Upgrade
              </LoadingContent>
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
              disabled={portal.isPending}
              onClick={() =>
                portal.mutate({ returnUrl: stripeReturnUrl('plan') })
              }
            >
              <LoadingContent loading={portal.isPending}>Manage</LoadingContent>
            </Button>
          </SettingsRow>
        </SettingsGroup>
      )}
    </>
  )
}

const formatCents = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    currency: 'USD',
    style: 'currency',
  }).format(amount / 100)

const Invoices = () => {
  const { data: invoices = [] } = useQuery(orpc.account.invoices.queryOptions())

  if (invoices.length === 0) {
    return null
  }

  return (
    <SettingsGroup title="Invoices">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-2/5">Date</TableHead>
            <TableHead className="w-1/4 text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow key={invoice.id}>
              <TableCell>{format(invoice.createdAt, 'MMMM d, yyyy')}</TableCell>
              <TableCell variant="numeric">
                {formatCents(invoice.amount)}
              </TableCell>
              <TableCell>
                {uppercaseFirst(invoice.status ?? 'unknown')}
              </TableCell>
              <TableCell className="text-right">
                {invoice.url && (
                  <Button
                    variant="ghost-muted"
                    size="xs"
                    render={
                      <a
                        href={invoice.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="View invoice"
                      />
                    }
                  >
                    View
                    <HugeiconsIcon
                      icon={ArrowUpRight01Icon}
                      strokeWidth={2}
                      data-icon="inline-end"
                    />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SettingsGroup>
  )
}

export const PlanSettings = () => (
  <>
    <Plan />
    <Invoices />
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
