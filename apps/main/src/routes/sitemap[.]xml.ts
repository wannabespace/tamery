import { createFileRoute } from '@tanstack/react-router'

import { publishedPosts } from '~/modules/blog/posts'
import { SITE_URL } from '~/utils/seo'

const PAGES = [
  '/',
  '/download',
  '/releases',
  '/privacy-policy',
  '/terms-of-service',
]

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () => {
        const posts = publishedPosts()
        const entries = [
          ...PAGES.map((path) => ({ lastmod: null, path })),
          { lastmod: posts.at(0)?.publishedAt ?? null, path: '/blog' },
          ...posts.map((post) => ({
            lastmod: post.publishedAt,
            path: `/blog/${post.slug}`,
          })),
        ]
        const urls = entries
          .map(
            ({ lastmod, path }) =>
              `<url><loc>${SITE_URL}${path}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`
          )
          .join('')

        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
          { headers: { 'Content-Type': 'application/xml' } }
        )
      },
    },
  },
})
