import { FavouriteIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@tamery/ui/components/alert'
import { Button } from '@tamery/ui/components/button'
import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router'
import { type } from 'arktype'
import JSConfetti from 'js-confetti'
import { useEffect, useState } from 'react'

import { AccountPage } from '~/components/account-page'
import { orpc } from '~/lib/orpc'

import { Subscription } from './-components/subscription'

const confetti = typeof window === 'undefined' ? null : new JSConfetti()
const { useSearch } = getRouteApi('/account/')

const DESKTOP_URL = 'tamery://'

const getReturnUrl = (clientType: 'web' | 'desktop' | 'cli' | undefined) => {
  if (clientType === 'desktop') {
    return DESKTOP_URL
  }
  if (clientType === 'web') {
    return import.meta.env.VITE_PUBLIC_WEB_URL
  }
  return null
}

const RouteComponent = () => {
  const { subscription, type: clientType } = useSearch()
  const router = useRouter()
  // oxlint-disable-next-line react/hook-use-state
  const [isSuccess] = useState(() => subscription === 'success')
  // oxlint-disable-next-line react/hook-use-state
  const [returnUrl] = useState(() => getReturnUrl(clientType))

  useEffect(() => {
    if (!isSuccess) {
      return
    }

    const timeout1 = setTimeout(() => {
      confetti?.addConfetti()
    }, 500)
    const timeout2 = returnUrl
      ? setTimeout(() => {
          location.assign(returnUrl)
        }, 2000)
      : undefined
    router.navigate({ to: '/account', replace: true })

    return () => {
      clearTimeout(timeout1)
      clearTimeout(timeout2)
    }
  }, [isSuccess, returnUrl, router])

  return (
    <AccountPage title="Subscription">
      {isSuccess && (
        <Alert variant="success">
          <HugeiconsIcon icon={FavouriteIcon} strokeWidth={2} />
          <AlertTitle>Welcome to Tamery Pro</AlertTitle>
          <AlertDescription>
            Your subscription is active. Thank you for supporting Tamery.
          </AlertDescription>
          {!returnUrl && (
            <AlertAction>
              <Button
                variant="outline"
                size="xs"
                render={<a href={DESKTOP_URL} aria-label="Open Tamery" />}
              >
                Open Tamery
              </Button>
            </AlertAction>
          )}
        </Alert>
      )}
      <Subscription />
    </AccountPage>
  )
}

export const Route = createFileRoute('/account/')({
  validateSearch: type({
    'subscription?': '"success" | "cancel"',
    'period?': '"monthly" | "yearly"',
    'type?': '"web" | "desktop" | "cli"',
  }),
  component: RouteComponent,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({
        ...orpc.account.subscription.list.queryOptions(),
        staleTime: 'static',
      }),
      context.queryClient.query({
        ...orpc.account.subscription.seats.list.queryOptions(),
        staleTime: 'static',
      }),
    ])
  },
})
