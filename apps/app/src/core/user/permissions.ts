import {
  GUEST_CONNECTIONS_MESSAGE,
  SHARE_ACCOUNT_MESSAGE,
} from '@tamery/shared/constants'
import type { Permissions } from '@tamery/shared/permissions'
import { getPermissions } from '@tamery/shared/permissions'
import { FREE_SHARE_LIMIT_MESSAGE } from '@tamery/shared/usage'
import { Result } from 'better-result'
import { createPermix } from 'permix'
import { usePermix } from 'permix/react'
import { useEffect } from 'react'

import { authClient, getSessionUser, isAnonymous } from '~/lib/auth'
import { API_QUERY_KEY, queryClient } from '~/lib/query-client'
import { promptSignIn, setIsSubscriptionDialogOpen } from '~/store'

import { aiKeyQueryOptions, useAiKey } from './ai-key'
import {
  isActiveSubscription,
  subscriptionsQueryOptions,
  useSubscription,
} from './use-subscription'

// check() throws until setup() runs, so every route under _protected must stay behind loadPermissions.
export const permix = createPermix<Permissions>()

export const usePermissions = () => usePermix(permix)

const SIGN_IN_HINTS: Partial<Record<keyof Permissions, string>> = {
  ai: 'AI features need an account.',
  connection: GUEST_CONNECTIONS_MESSAGE,
  mcp: 'Unlimited agent queries need an account and Tamery Pro.',
  share: SHARE_ACCOUNT_MESSAGE,
}

const UPGRADE_HINTS: Record<string, string> = {
  'share.create': FREE_SHARE_LIMIT_MESSAGE,
}

export const checkOrUpgrade = (...args: Parameters<typeof permix.check>) => {
  if (permix.check(...args)) {
    return true
  }

  const [path] = args

  if (isAnonymous()) {
    const group = typeof path === 'string' ? path.split('.')[0] : undefined
    promptSignIn(
      SIGN_IN_HINTS[group as keyof Permissions] ?? 'That needs an account.'
    )
  } else {
    setIsSubscriptionDialogOpen(
      true,
      typeof path === 'string' ? (UPGRADE_HINTS[path] ?? null) : null,
      { offerAiKey: typeof path === 'string' && path.startsWith('ai.') }
    )
  }

  return false
}

export const loadPermissions = async () => {
  const user = await getSessionUser()
  const [subscriptions, aiKey] = user?.isAnonymous
    ? [null, null]
    : await Promise.all([
        Result.tryPromise(() =>
          queryClient.query({
            ...subscriptionsQueryOptions,
            staleTime: 'static',
          })
        ),
        Result.tryPromise(() => queryClient.query(aiKeyQueryOptions)),
      ])

  permix.setup(
    getPermissions({
      hasAiKey: !!aiKey?.unwrapOr(null),
      subscription:
        subscriptions?.unwrapOr(null)?.find(isActiveSubscription) ?? null,
      user: user ?? {},
    })
  )
}

export const resetGuestState = async () => {
  const { cleanCollections } = await import('~/core/collections')
  await cleanCollections()
  queryClient.removeQueries({ queryKey: [API_QUERY_KEY] })
  await loadPermissions()
}

export const usePermissionsSync = () => {
  const user = authClient.useSession().data?.user
  const { isLoading, subscription } = useSubscription()
  const { aiKey, isLoading: isAiKeyLoading } = useAiKey()

  useEffect(() => {
    if (user && !isLoading && !isAiKeyLoading) {
      permix.setup(getPermissions({ hasAiKey: !!aiKey, subscription, user }))
    }
  }, [user, isLoading, isAiKeyLoading, aiKey, subscription])
}
