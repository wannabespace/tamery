import { createFileRoute } from '@tanstack/react-router'
import { createFromSource } from 'fumadocs-core/search/server'

import { SEARCH_KEYWORDS_ANCHOR } from '~/constants'
import { source } from '~/lib/source'

// zbsearch's advanced mode only matches `content` (not the `tags` filter facet, nor breadcrumbs).
// Keywords get their own record: appended to the title they lengthen it, and BM25 then ranks the
// page's title hit below short body lines. The palette hides the record by its anchor.
const server = createFromSource(source, {
  async buildIndex(page) {
    const { description, keywords, title } = page.data
    const structuredData = await page.data.structuredData()

    return {
      description,
      id: page.url,
      structuredData: keywords
        ? {
            ...structuredData,
            contents: [
              ...structuredData.contents,
              { content: keywords.join(' '), heading: SEARCH_KEYWORDS_ANCHOR },
            ],
          }
        : structuredData,
      title,
      url: page.url,
    }
  },
})

export const Route = createFileRoute('/api/search')({
  server: {
    handlers: {
      GET: ({ request }) => server.GET(request),
    },
  },
})
