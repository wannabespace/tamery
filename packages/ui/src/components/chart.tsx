import { cn } from '@tamery/ui/lib/utils'
import type { ComponentProps, ReactElement, ReactNode } from 'react'
import * as RechartsPrimitive from 'recharts'

/** Recharts in kit colors: axis ticks, grid and the hover cursor take theme tokens, and the chart fills its box. Adapted from the shadcn `chart` registry item, keeping only what the app draws. */
export const ChartContainer = ({
  children,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'children'> & { children: ReactElement }) => (
  <div
    data-slot="chart"
    className={cn(
      "text-2xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted flex justify-center [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-surface]:outline-hidden",
      className
    )}
    {...props}
  >
    <RechartsPrimitive.ResponsiveContainer>
      {children}
    </RechartsPrimitive.ResponsiveContainer>
  </div>
)

export const ChartTooltip = RechartsPrimitive.Tooltip

/** The hovered point: its x label over its value, in the kit tooltip's surface. */
export const ChartTooltipContent = ({
  active,
  label,
  payload,
  formatValue,
}: {
  active?: boolean
  formatValue: (value: unknown) => ReactNode
  label?: ReactNode
  payload?: readonly { value?: unknown }[]
}) => {
  const [point] = payload ?? []
  if (!(active && point)) {
    return null
  }
  return (
    <div className="bg-foreground text-background flex flex-col gap-0.5 rounded-xl px-3 py-1.5 text-xs">
      <span className="opacity-70">{label}</span>
      <span className="font-medium tabular-nums">
        {formatValue(point.value)}
      </span>
    </div>
  )
}
