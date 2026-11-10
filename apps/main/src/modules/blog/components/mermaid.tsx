import { useEffect, useId, useState } from 'react'

const themeCSS = `
  .node rect, .node polygon, .node path { fill: var(--popover); stroke: var(--border); }
  .nodeLabel, .edgeLabel { color: var(--foreground); }
  .edgeLabel, .labelBkg { background: transparent; }
  .flowchart-link { stroke: var(--muted-foreground); }
  .marker { fill: var(--muted-foreground); stroke: var(--muted-foreground); }
  .cluster rect { fill: var(--muted); stroke: var(--border); }
  .cluster-label .nodeLabel { color: var(--muted-foreground); }
`

const renderChart = async (id: string, chart: string) => {
  const { default: mermaid } = await import('mermaid')
  mermaid.initialize({
    fontFamily: 'inherit',
    startOnLoad: false,
    theme: 'base',
    themeCSS,
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
