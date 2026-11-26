import { cn } from '@tamery/ui/lib/utils'
import type { ReactNode } from 'react'
import { useEffect, useId, useState } from 'react'

const ring = 'color-mix(in oklab, var(--foreground) 8%, transparent)'
const rule = 'color-mix(in oklab, var(--foreground) 8%, var(--popover))'

// An ER entity is drawn as paths, which take no `rx`: it is rounded by a clip-path, and its border is the drop-shadows on its parent, since a stroke or filter on the clipped node itself would be clipped away. The clip sits 1px inside the edge because every row is a stroked rectangle whose sides would otherwise draw a second line against that border.
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
  .nodes:has(.outer-path) { filter: drop-shadow(1px 0 0 ${rule}) drop-shadow(-1px 0 0 ${rule}) drop-shadow(0 1px 0 ${rule}) drop-shadow(0 -1px 0 ${rule}); }
  .node:has(.outer-path) { clip-path: inset(1px round 12px); }
  .node:has(.outer-path) path { fill: var(--popover) !important; stroke: none !important; filter: none; }
  .node .divider path, .node :is(.row-rect-odd, .row-rect-even) path:last-child { stroke: ${rule} !important; stroke-width: 1px !important; }
  .node :is(.attribute-type, .attribute-keys, .attribute-comment) .nodeLabel { color: var(--muted-foreground) !important; font-weight: 400; }
  .node .attribute-name .nodeLabel { font-weight: 400; }
  .relationshipLine { stroke: ${ring} !important; stroke-width: 1.5px !important; }
  .marker.er :is(path, circle) { fill: var(--background) !important; stroke: color-mix(in oklab, var(--foreground) 35%, transparent) !important; stroke-width: 1px !important; }
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
    er: { entityPadding: 12 },
    themeVariables: {
      fontSize: chart.trimStart().startsWith('erDiagram') ? '12px' : '14px',
    },
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
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    void renderChart(id, chart)
      .then(setSvg)
      .catch(() => setSvg(null))
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
