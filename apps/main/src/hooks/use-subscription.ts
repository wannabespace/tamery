import { ACTIVE_SUBSCRIPTION_STATUSES } from '@tamery/shared/constants'
import type { SubscriptionPlan } from '@tamery/shared/permissions'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'

import { authClient } from '~/lib/auth'
import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'

export const useSubscription = () => {
  const { data } = authClient.useSession()
  const isSignedIn = !!data?.user.id
  const { data: list } = useQuery(
    orpc.account.subscription.list.queryOptions({
      enabled: isSignedIn,
    })
  )

  if (!isSignedIn) {
    return null
  }

  return (
    list?.find((s) =>
      ACTIVE_SUBSCRIPTION_STATUSES.includes(
        s.status as (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number]
      )
    ) ?? null
  )
}

export const useUpgradeSubscription = (
  clientType: 'web' | 'desktop' | 'cli' | undefined
) => {
  const router = useRouter()
  const returnHref = router.buildLocation({
    search: { type: clientType },
    to: '/account',
  }).href
  const cancelHref = router.buildLocation({
    search: { subscription: 'cancel', type: clientType },
    to: '/account',
  }).href

  const {
    mutate: upgrade,
    isPending,
    variables,
  } = useMutation({
    mutationFn: async ({
      isYearly,
      plan,
    }: {
      isYearly: boolean
      plan: SubscriptionPlan
    }) => {
      const successHref = router.buildLocation({
        search: { plan, subscription: 'success', type: clientType },
        to: '/account',
      }).href
      const result = await orpc.account.subscription.upgrade.call({
        cancelUrl: location.origin + cancelHref,
        isYearly,
        plan,
        returnUrl: location.origin + returnHref,
        successUrl: location.origin + successHref,
      })

      location.assign(result.url)
    },
    mutationKey: ['subscription', 'upgrade'],
    onSettled: (_data, error, { plan }) => {
      void posthog.capture('subscription_checkout_started', {
        plan,
        success: !error,
      })
    },
  })

  return {
    upgrade,
    upgradingPlan: (isPending && variables?.plan) || null,
  }
}

export const useBillingPortal = ({ returnHref }: { returnHref: string }) => {
  const { mutate, isPending: isOpening } = useMutation(
    orpc.account.subscription.billingPortal.mutationOptions({
      mutationKey: ['subscription', 'billingPortal'],
      onSuccess(result) {
        location.assign(result.url)
      },
    })
  )

  const openBillingPortal = (
    intent: 'manage' | 'invoices' | 'switch_to_team' | 'change_seats'
  ) => {
    mutate(
      {
        changePlan: intent !== 'manage',
        returnUrl: location.origin + returnHref,
      },
      {
        onSettled: (_data, error) => {
          void posthog.capture('billing_portal_opened', {
            intent,
            success: !error,
          })
        },
      }
    )
  }

  return {
    isOpening,
    openBillingPortal,
  }
}
