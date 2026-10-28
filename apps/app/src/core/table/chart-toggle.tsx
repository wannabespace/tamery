import { ChartLineData01Icon, TableIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'

import { posthog } from '~/lib/posthog'

/** Swaps a result between its table and its chart; shown only when the result has a chart. */
export const ChartToggle = ({
  asChart,
  onChange,
}: {
  asChart: boolean
  onChange: (asChart: boolean) => void
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          variant="ghost-muted"
          size="icon-xs"
          aria-label={asChart ? 'Show as table' : 'Show as chart'}
          aria-pressed={asChart}
          onClick={() => {
            posthog.capture('result_chart_toggled', { chart: !asChart })
            onChange(!asChart)
          }}
        />
      }
    >
      <HugeiconsIcon
        icon={asChart ? TableIcon : ChartLineData01Icon}
        strokeWidth={2}
      />
    </TooltipTrigger>
    <TooltipContent side="top">
      {asChart ? 'Show as table' : 'Show as chart'}
    </TooltipContent>
  </Tooltip>
)
