import { cn } from '@tamery/ui/lib/utils'
import type { ReactNode } from 'react'
import { useEffect, useId, useState } from 'react'

const ring = 'color-mix(in oklab, var(--foreground) 8%, transparent)'

const themeCSS = `
  .node rect, .node polygon, .node path {
    fill: var(--popover) !important;
    stroke: ${ring} !important;
    stroke-width: 1px !important;
    rx: 10px;
    filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.05));
  }
  .nodeLabel { color: var(--foreground) !important; font-weight: 500; }
  .nodeLabel small { display: block; color: var(--muted-foreground); font-size: 12px; font-weight: 400; }
  .edgeLabel, .edgeLabel p, .labelBkg { background: var(--background) !important; color: var(--muted-foreground) !important; font-size: 12px; }
  .flowchart-link { stroke: ${ring} !important; stroke-width: 1.5px !important; }
  .marker { fill: color-mix(in oklab, var(--foreground) 25%, transparent) !important; stroke: none !important; }
  .cluster rect {
    fill: color-mix(in oklab, var(--muted) 50%, transparent) !important;
    stroke: ${ring} !important;
    rx: 16px;
  }
  .cluster-label .nodeLabel { color: var(--muted-foreground) !important; font-size: 12px; font-weight: 500; }
`

const renderChart = async (id: string, chart: string) => {
  const { default: mermaid } = await import('mermaid')
  mermaid.initialize({
    fontFamily: 'inherit',
    startOnLoad: false,
    flowchart: {
      nodeSpacing: 32,
      rankSpacing: 40,
      subGraphTitleMargin: { bottom: 8, top: 8 },
    },
    theme: 'base',
    themeCSS,
    themeVariables: { fontSize: '14px' },
  })
  const { svg } = await mermaid.render(id, chart)
  return svg
}

export const Mermaid = ({
  chart,
  className,
  fallback = null,
}: {
  chart: string
  className?: string
  /** Shown until the chart renders, and instead of it when the chart does not parse. */
  fallback?: ReactNode
}) => {
  // Mermaid uses the id as a CSS selector, which React's `«r0»` ids break.
  const id = `mermaid-${useId().replaceAll(/[^\w-]/gu, '')}`
  const [svg, setSvg] = useState('')

  useEffect(() => {
    void renderChart(id, chart).then(setSvg, () => setSvg(''))
  }, [chart, id])

  if (!svg) {
    return fallback
  }

  return (
    <figure
      className={cn('flex justify-center [&_svg]:max-w-full', className)}
      // oxlint-disable-next-line react/no-danger -- Mermaid's own SVG, rendered at its default strict security level, which strips scripts and HTML labels from a chart the AI wrote.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
