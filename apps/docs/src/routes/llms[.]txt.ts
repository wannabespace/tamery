import { createFileRoute } from '@tanstack/react-router'

import { SITE_URL } from '~/constants'
import { source } from '~/lib/source'

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: () => {
        const links = source.getPages().map((page) => {
          const link = `- [${page.data.title}](${SITE_URL}${page.url})`

          return page.data.description
            ? `${link}: ${page.data.description}`
            : link
        })

        return new Response(['# Tamery docs', '', ...links].join('\n'), {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      },
    },
  },
})
