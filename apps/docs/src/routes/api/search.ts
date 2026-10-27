import { createFileRoute } from '@tanstack/react-router'
import { createFromSource } from 'fumadocs-core/search/server'

import { source } from '~/lib/source'

// zbsearch's advanced mode only matches the `content` field (not `tags`, a filter facet, nor
// breadcrumbs), and the page row's content is its title. Keywords append to the indexed title so a
// synonym hit matches the page; the row still renders the real title from nav, never this blob.
const server = createFromSource(source, {
  async buildIndex(page) {
    const { keywords, title } = page.data

    return {
      description: page.data.description,
      id: page.url,
      structuredData: await page.data.structuredData(),
      title: keywords ? `${title} ${keywords.join(' ')}` : title,
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
