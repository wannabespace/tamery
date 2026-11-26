import { Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@tamery/ui/lib/utils'
import type { ReactNode } from 'react'

import { pageCardClass } from '~/utils/card'

export const PlanFeatures = ({
  features,
  includes,
}: {
  features: string[]
  includes: string | null
}) => (
  <div className="flex flex-col gap-3 text-sm">
    {includes && (
      <p className="text-muted-foreground">Everything in {includes}, plus</p>
    )}
    <ul className="flex flex-col gap-3">
      {features.map((feature) => (
        <li key={feature} className="flex gap-2.5">
          <HugeiconsIcon
            icon={Tick02Icon}
            strokeWidth={2}
            className="text-primary mt-0.5 size-4 shrink-0"
          />
          {feature}
        </li>
      ))}
    </ul>
  </div>
)

export const PlanCard = ({
  action,
  description,
  features,
  highlighted,
  includes,
  name,
  price,
}: {
  action: ReactNode
  description: string
  features: string[]
  highlighted?: boolean
  includes: string | null
  name: string
  price: ReactNode
}) => (
  <article
    className={cn(
      pageCardClass,
      'flex flex-col p-6 sm:p-8',
      highlighted && 'bg-popover shadow-md'
    )}
  >
    <h3 className="font-medium">{name}</h3>
    <p className="text-muted-foreground mt-1 text-sm">{description}.</p>
    <div className="mt-6 flex h-10 items-baseline gap-1">{price}</div>
    <div className="mt-6 grid">{action}</div>
    <div className="mt-8 border-t pt-6">
      <PlanFeatures features={features} includes={includes} />
    </div>
  </article>
)
