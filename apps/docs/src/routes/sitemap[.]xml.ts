import { createFileRoute } from '@tanstack/react-router'

import { SITE_URL } from '~/constants'
import { source } from '~/lib/source'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const urls = await Promise.all(
          source.getPages().map(async ({ data, url }) => {
            const { lastModified } = await data.load()
            return `<url><loc>${SITE_URL}${url}</loc>${lastModified ? `<lastmod>${lastModified.toISOString()}</lastmod>` : ''}</url>`
          })
        )

        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`,
          { headers: { 'Content-Type': 'application/xml' } }
        )
      },
    },
  },
})
