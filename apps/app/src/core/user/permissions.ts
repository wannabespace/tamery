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

import { aiKeysQueryOptions, useAiKeys } from './ai-key'
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
      { offerAiKey: path === 'ai.chat.use' }
    )
  }

  return false
}

export const loadPermissions = async () => {
  const user = await getSessionUser()
  const [subscriptions, aiKeys] = user?.isAnonymous
    ? [null, null]
    : await Promise.all([
        Result.tryPromise(() =>
          queryClient.query({
            ...subscriptionsQueryOptions,
            staleTime: 'static',
          })
        ),
        Result.tryPromise(() => queryClient.query(aiKeysQueryOptions)),
      ])

  permix.setup(
    getPermissions({
      hasAiKey: !!aiKeys?.unwrapOr([]).some(({ enabled }) => enabled),
      subscription:
        subscriptions?.unwrapOr(null)?.find(isActiveSubscription) ?? null,
      user: user ?? {},
    })
  )
}

export const resetGuestState = async () => {
  const [{ cleanCollections }, { machine }] = await Promise.all([
    import('~/core/collections'),
    import('~/core/runtime/machine/machine'),
  ])
  // The guest's account is gone, but this computer's machine process still signs in as it.
  await machine.forgetThisComputer(null)
  await cleanCollections()
  queryClient.removeQueries({ queryKey: [API_QUERY_KEY] })
  await loadPermissions()
}

export const usePermissionsSync = () => {
  const user = authClient.useSession().data?.user
  const { isLoading, subscription } = useSubscription()
  const { aiKeys, isLoading: isAiKeyLoading } = useAiKeys()
  const hasAiKey = aiKeys.some(({ enabled }) => enabled)

  useEffect(() => {
    if (user && !isLoading && !isAiKeyLoading) {
      permix.setup(getPermissions({ hasAiKey, subscription, user }))
    }
  }, [user, isLoading, isAiKeyLoading, hasAiKey, subscription])
}
