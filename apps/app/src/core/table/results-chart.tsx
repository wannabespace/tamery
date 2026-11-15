import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tamery/ui/components/chart'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts'

import type { ResultChart } from './result-chart'

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
const compact = new Intl.NumberFormat(undefined, { notation: 'compact' })
const MARGIN = { bottom: 4, left: 4, right: 16, top: 16 }

const MAX_LABELLED_BARS = 12
const MAX_TICK_LENGTH = 12

const shorten = (label: string) =>
  label.length > MAX_TICK_LENGTH
    ? `${label.slice(0, MAX_TICK_LENGTH - 1)}…`
    : label

/** A few bars each keep their label, cut short with the whole name in the tooltip; a line or many bars thin their ticks to fit. */
const axes = (chart: ResultChart) => (
  <>
    <CartesianGrid vertical={false} />
    {chart.kind === 'bar' && chart.points.length <= MAX_LABELLED_BARS ? (
      <XAxis
        dataKey="x"
        tickLine={false}
        axisLine={false}
        interval={0}
        tickFormatter={shorten}
      />
    ) : (
      <XAxis dataKey="x" tickLine={false} axisLine={false} minTickGap={24} />
    )}
    <YAxis
      tickLine={false}
      axisLine={false}
      width={48}
      tickFormatter={(value: number) => compact.format(value)}
    />
    <ChartTooltip
      content={
        <ChartTooltipContent
          formatValue={(value) => number.format(Number(value))}
        />
      }
    />
  </>
)

/** A result drawn as the chart its shape asks for, one series in the primary color: the toggle beside the table swaps it in. */
export const ResultsChart = ({ chart }: { chart: ResultChart }) => (
  <ChartContainer data-mask className="size-full">
    {chart.kind === 'line' ? (
      <LineChart data={chart.points} margin={MARGIN}>
        {axes(chart)}
        <Line
          dataKey="y"
          stroke="var(--primary)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    ) : (
      <BarChart data={chart.points} margin={MARGIN}>
        {axes(chart)}
        <Bar
          dataKey="y"
          fill="var(--primary)"
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    )}
  </ChartContainer>
)
