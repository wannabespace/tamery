import { Source } from '@tamery/ui/components/sources'

/** The pages a web search read. */
export const WebSources = ({
  sources,
}: {
  sources: { title: string; url: string }[]
}) => (
  <ul className="-mx-1.5 flex flex-col">
    {sources.map((source) => (
      <li key={source.url} className="flex">
        <Source href={source.url} title={source.title} />
      </li>
    ))}
  </ul>
)
