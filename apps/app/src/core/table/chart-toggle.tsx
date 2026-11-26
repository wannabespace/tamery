import { ChartLineData01Icon, TableIcon } from '@hugeicons/core-free-icons'
import { IconButton } from '@tamery/ui/components/custom/icon-button'

import { posthog } from '~/lib/posthog'

/** Swaps a result between its table and its chart; shown only when the result has a chart. */
export const ChartToggle = ({
  asChart,
  onChange,
}: {
  asChart: boolean
  onChange: (asChart: boolean) => void
}) => (
  <IconButton
    variant="ghost-muted"
    size="icon-xs"
    side="top"
    icon={asChart ? TableIcon : ChartLineData01Icon}
    label={asChart ? 'Show as table' : 'Show as chart'}
    aria-pressed={asChart}
    onClick={() => {
      posthog.capture('result_chart_toggled', { chart: !asChart })
      onChange(!asChart)
    }}
  />
)
