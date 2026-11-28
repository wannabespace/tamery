import { smallItemInsetClassName } from '@tamery/ui/components/item'
import { cn } from '@tamery/ui/lib/utils'

import { Invoices } from './invoices'
import { Plan } from './plan'

export const PlanSettings = () => (
  <>
    <Plan />
    <Invoices />
    <p
      className={cn(
        smallItemInsetClassName,
        'text-muted-foreground text-xs text-pretty'
      )}
    >
      Tamery is independent and funded by its users, with no investors. Your
      subscription pays for its development. Thank you.
    </p>
  </>
)
