import { lazy, Suspense } from 'react'
import type { ComponentProps } from 'react'

const ResultsChart = lazy(async () => {
  const { ResultsChart: Chart } = await import('./results-chart')
  return { default: Chart }
})

/** Recharts loads with the first chart someone asks for, never with the tab. */
export const LazyResultsChart = (
  props: ComponentProps<typeof ResultsChart>
) => (
  <Suspense>
    <ResultsChart {...props} />
  </Suspense>
)
