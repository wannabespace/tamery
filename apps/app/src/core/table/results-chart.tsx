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

const axes = (
  <>
    <CartesianGrid vertical={false} />
    <XAxis dataKey="x" tickLine={false} axisLine={false} minTickGap={24} />
    <YAxis
      tickLine={false}
      axisLine={false}
      width={40}
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
      <LineChart data={chart.points}>
        {axes}
        <Line
          dataKey="y"
          stroke="var(--primary)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    ) : (
      <BarChart data={chart.points}>
        {axes}
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
