import type { SubscriptionPlan } from '@tamery/shared/permissions'
import { FREE_SHARE_LIMIT, FREE_WEEKLY_LIMITS } from '@tamery/shared/usage'

export interface PricingPlan {
  description: string
  features: string[]
  highlighted: boolean
  id: SubscriptionPlan | 'free'
  includes: string | null
  name: string
  perSeat: boolean
  price: {
    monthly: number
    yearly: number
  }
}

export const HOBBY_PLAN = {
  description: 'Every database feature, a taste of AI',
  features: [
    'Table browser, SQL editor and visualizer',
    'Unlimited synced connections',
    `${FREE_WEEKLY_LIMITS.filters} AI filters a week`,
    `${FREE_WEEKLY_LIMITS.complete} AI SQL completions a week`,
    'AI connection diagnosis',
    `${FREE_WEEKLY_LIMITS.mcp} MCP agent queries a week`,
    `${FREE_SHARE_LIMIT} shared table links`,
  ],
  highlighted: false,
  id: 'free',
  includes: null,
  name: 'Free',
  perSeat: false,
  price: {
    monthly: 0,
    yearly: 0,
  },
} satisfies PricingPlan

export const PRO_PLAN = {
  description: 'The full AI assistant, without limits',
  features: [
    'AI chat for any query or error',
    'Edit and fix SQL with AI',
    'No weekly quota on AI filters, completions or MCP',
    'Team workspaces with roles',
    'Unlimited shared table links and test-data runs',
  ],
  highlighted: true,
  id: 'pro',
  includes: HOBBY_PLAN.name,
  name: 'Pro',
  perSeat: false,
  price: {
    monthly: 15,
    yearly: 150,
  },
} satisfies PricingPlan

export const TEAM_PLAN = {
  description: 'Pro for everyone you work with',
  features: [
    'Every Pro feature on each seat',
    'One subscription and one invoice',
    'Assign and reassign seats by email',
    'Add seats as your team grows',
  ],
  highlighted: false,
  id: 'team',
  includes: PRO_PLAN.name,
  name: 'Team',
  perSeat: true,
  price: {
    monthly: 20,
    yearly: 200,
  },
} satisfies PricingPlan

export const PAID_PLANS = [PRO_PLAN, TEAM_PLAN]

export const getPriceUnit = (
  plan: PricingPlan,
  period: keyof PricingPlan['price']
) =>
  `${plan.perSeat ? '/ seat ' : ''}/ ${period === 'monthly' ? 'month' : 'year'}`
