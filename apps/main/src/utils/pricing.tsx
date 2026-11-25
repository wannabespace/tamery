import type { SubscriptionPlan } from '@tamery/shared/permissions'
import { FREE_SHARE_LIMIT, FREE_WEEKLY_LIMITS } from '@tamery/shared/usage'

export interface PricingPlan<Id = SubscriptionPlan | 'free'> {
  id: Id
  name: string
  price: {
    monthly: number
    yearly: number
  }
  description: string
  features: string[]
}

export const HOBBY_PLAN: PricingPlan = {
  description: 'Every database feature, with a taste of AI',
  features: [
    'Table browser, SQL editor and visualizer',
    'Unlimited synced connections',
    `${FREE_WEEKLY_LIMITS.filters} AI filters a week`,
    'AI connection diagnosis',
    `${FREE_WEEKLY_LIMITS.mcp} MCP agent queries a week`,
    `${FREE_SHARE_LIMIT} shared table links`,
  ],
  id: 'free',
  name: 'Free',
  price: {
    monthly: 0,
    yearly: 0,
  },
}

export const PRO_PLAN: PricingPlan<SubscriptionPlan> = {
  description: 'The full AI assistant, without limits',
  features: [
    'Schema-aware AI assistant',
    'Unlimited AI filters and MCP queries',
    'Included AI credits',
    'Extra workspaces',
    'Unlimited shared table links',
  ],
  id: 'pro',
  name: 'Pro',
  price: {
    monthly: 15,
    yearly: 150,
  },
}

export const TEAM_PLAN: PricingPlan<SubscriptionPlan> = {
  description: 'Pro for everyone you work with',
  features: [
    'Pro for every seat',
    'One subscription and one invoice',
    'Assign and move seats by email',
  ],
  id: 'team',
  name: 'Team',
  price: {
    monthly: 20,
    yearly: 200,
  },
}

export const getPriceUnit = (
  { id }: PricingPlan,
  period: keyof PricingPlan['price']
) =>
  `${id === 'team' ? '/ seat ' : ''}/ ${period === 'monthly' ? 'month' : 'year'}`
