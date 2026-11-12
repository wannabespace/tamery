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

export const Mermaid = ({ chart }: { chart: string }) => {
  // Mermaid uses the id as a CSS selector, which React's `«r0»` ids break.
  const id = `mermaid-${useId().replaceAll(/[^\w-]/gu, '')}`
  const [svg, setSvg] = useState('')

  useEffect(() => {
    void renderChart(id, chart).then(setSvg)
  }, [chart, id])

  return (
    <figure
      className="my-8 flex justify-center [&_svg]:max-w-full"
      // oxlint-disable-next-line react/no-danger -- Mermaid's own SVG from a chart in our repo.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
