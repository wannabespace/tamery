import { createFileRoute, notFound } from '@tanstack/react-router'
import type { Graph } from 'schema-dts'

import { DocsScreen } from '~/components/docs-screen'
import { SITE_URL, WEB_URL } from '~/constants'
import { source } from '~/lib/source'

const OG_IMAGE_URL = `${WEB_URL}/og-image.png`

const getDocsPage = (splat: string | undefined) => {
  const page = source.getPage(splat?.split('/').filter(Boolean))

  if (!page) {
    throw notFound()
  }

  return page
}

const DocsRoute = () => {
  const page = getDocsPage(Route.useParams()._splat)

  return <DocsScreen page={page} />
}

export const Route = createFileRoute('/$')({
  component: DocsRoute,
  loader: async ({ params }) => {
    const { lastModified } = await getDocsPage(params._splat).data.load()
    return { lastModified }
  },
  head: ({ loaderData, params }) => {
    const page = getDocsPage(params._splat)
    const pageUrl = `${SITE_URL}${page.url}`
    const isIndex = page.url === '/'
    const title = isIndex ? 'Tamery Docs' : `${page.data.title} · Tamery Docs`
    const description = page.data.description ?? ''
    const structuredData = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'TechArticle',
          headline: page.data.title,
          description,
          url: pageUrl,
          image: OG_IMAGE_URL,
          ...(loaderData?.lastModified && {
            dateModified: loaderData.lastModified.toISOString(),
          }),
          publisher: {
            '@type': 'Organization',
            name: 'Tamery',
            url: WEB_URL,
            logo: `${WEB_URL}/logo.png`,
          },
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'Docs',
              item: `${SITE_URL}/`,
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: page.data.title,
              item: pageUrl,
            },
          ],
        },
      ],
    } satisfies Graph

    return {
      links: [{ href: pageUrl, rel: 'canonical' }],
      meta: [
        { title },
        { content: description, name: 'description' },
        { content: 'summary_large_image', name: 'twitter:card' },
        { content: '@tamery_app', name: 'twitter:site' },
        { content: title, name: 'twitter:title' },
        { content: description, name: 'twitter:description' },
        { content: OG_IMAGE_URL, name: 'twitter:image' },
        {
          content: isIndex ? 'website' : 'article',
          property: 'og:type',
        },
        { content: 'Tamery', property: 'og:site_name' },
        { content: pageUrl, property: 'og:url' },
        { content: title, property: 'og:title' },
        { content: description, property: 'og:description' },
        { content: OG_IMAGE_URL, property: 'og:image' },
        { content: '1200', property: 'og:image:width' },
        { content: '630', property: 'og:image:height' },
      ],
      scripts: isIndex
        ? []
        : [
            {
              children: JSON.stringify(structuredData),
              type: 'application/ld+json',
            },
          ],
    }
  },
})
