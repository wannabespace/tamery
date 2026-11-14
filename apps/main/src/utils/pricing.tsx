import { FREE_SHARE_LIMIT, FREE_WEEKLY_LIMITS } from '@tamery/shared/usage'

export interface PricingPlan {
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
  name: 'Free',
  price: {
    monthly: 0,
    yearly: 0,
  },
}

export const PRO_PLAN: PricingPlan = {
  description: 'The full AI assistant, without limits',
  features: [
    'Schema-aware AI assistant',
    'Unlimited AI filters and MCP queries',
    'Included AI credits',
    'Extra workspaces',
    'Unlimited shared table links',
  ],
  name: 'Pro',
  price: {
    monthly: 10,
    yearly: 100,
  },
}
