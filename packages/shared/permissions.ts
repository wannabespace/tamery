import type { Rules } from 'permix'

import { FREE_SHARE_LIMIT } from './usage'

export type SubscriptionPlan = 'pro' | 'team'

// oxlint-disable-next-line typescript/consistent-type-definitions -- permix's Definition needs an index signature, which an interface lacks
export type Permissions = {
  ai: {
    chat: ['use']
    credits: ['buy']
    filter: ['use', 'unlimited']
    query: ['complete', 'completeUnlimited', 'use']
  }
  connection: [{ name: 'create'; type: { count: number } }]
  mcp: ['unlimited']
  seed: ['unlimited']
  share: [{ name: 'create'; type: { count: number } }]
  tab: ['multiple']
  workspace: ['create']
}

export const getPermissions = ({
  hasAiKey,
  subscription,
  user,
}: {
  hasAiKey: boolean
  subscription: { plan: SubscriptionPlan } | null
  user: { isAnonymous?: boolean | null }
}): Rules<Permissions> => {
  const member = !user.isAnonymous
  const pro = member && !!subscription

  return {
    ai: {
      chat: { use: pro || (member && hasAiKey) },
      credits: { buy: pro },
      filter: { unlimited: pro, use: member },
      // Ghost-text autocomplete is free for members (weekly-limited server-side), unlimited for Pro; edit/fix/update stay Pro.
      query: { complete: member, completeUnlimited: pro, use: pro },
    },
    connection: {
      create: member || ((connections) => connections?.count === 0),
    },
    mcp: { unlimited: pro },
    seed: { unlimited: pro },
    share: {
      create:
        pro || ((shares) => member && (shares?.count ?? 0) < FREE_SHARE_LIMIT),
    },
    tab: { multiple: member },
    workspace: { create: pro },
  }
}
