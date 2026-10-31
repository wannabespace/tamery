import { NumberFlow } from '@tamery/ui/components/custom/number-flow'

import type { PricingPlan } from '~/utils/pricing'

export type Period = keyof PricingPlan['price']

export const Price = ({
  period,
  plan,
}: {
  period: Period
  plan: PricingPlan
}) => (
  <>
    <NumberFlow
      value={plan.price[period]}
      className="text-4xl [--number-flow-mask-height:0px]"
      format={{
        currency: 'USD',
        currencyDisplay: 'narrowSymbol',
        maximumFractionDigits: 0,
        style: 'currency',
      }}
    />
    <span className="text-muted-foreground text-sm">
      {period === 'monthly' ? '/ month' : '/ year'}
    </span>
  </>
)
