import { PRO_INCLUDED_AI_USD, PRO_PRICE_USD } from './credits'
import type { SubscriptionPlan } from './permissions'
import { FREE_SHARE_LIMIT, FREE_WEEKLY_LIMITS } from './usage'

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
  description: 'Every database feature, with a taste of AI',
  features: [
    'Table browser, SQL editor and visualizer',
    'Unlimited synced connections',
    `${FREE_WEEKLY_LIMITS.filters} AI filters a week`,
    'AI connection diagnosis',
    'AI chat with your own Anthropic, OpenAI, Google or OpenRouter key',
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
  description: 'The full AI assistant, without weekly limits',
  features: [
    'Schema-aware AI assistant',
    'Unlimited AI filters and MCP queries',
    `$${PRO_INCLUDED_AI_USD} of AI included every month`,
    'Extra workspaces',
    'Unlimited shared table links',
  ],
  highlighted: true,
  id: 'pro',
  includes: HOBBY_PLAN.name,
  name: 'Pro',
  perSeat: false,
  price: PRO_PRICE_USD,
} satisfies PricingPlan

export const TEAM_PLAN = {
  description: 'Pro for everyone you work with',
  features: [
    'Pro for every seat',
    'One subscription and one invoice',
    'Assign and move seats by email',
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
