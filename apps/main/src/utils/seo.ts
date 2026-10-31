export const SITE_URL = 'https://tamery.app'

export const seo = ({
  title,
  description,
  path,
  image = '/og-image.png',
  article,
}: {
  title: string
  description?: string
  path: string
  image?: string
  article?: { publishedTime: string; author: string }
}) => {
  const pageUrl = `${SITE_URL}${path}`
  const imageUrl = `${SITE_URL}${image}`

  const meta = [
    { title },
    ...(description ? [{ content: description, name: 'description' }] : []),
    { content: 'summary_large_image', name: 'twitter:card' },
    { content: '@tamery_app', name: 'twitter:site' },
    { content: '@letstri', name: 'twitter:creator' },
    { content: pageUrl, name: 'twitter:url' },
    { content: title, name: 'twitter:title' },
    ...(description
      ? [{ content: description, name: 'twitter:description' }]
      : []),
    { content: imageUrl, name: 'twitter:image' },
    { content: article ? 'article' : 'website', property: 'og:type' },
    ...(article
      ? [
          {
            content: article.publishedTime,
            property: 'article:published_time',
          },
          { content: article.author, property: 'article:author' },
        ]
      : []),
    { content: 'en_US', property: 'og:locale' },
    { content: 'Tamery', property: 'og:site_name' },
    { content: pageUrl, property: 'og:url' },
    { content: title, property: 'og:title' },
    ...(description
      ? [{ content: description, property: 'og:description' }]
      : []),
    { content: imageUrl, property: 'og:image' },
    { content: 'image/png', property: 'og:image:type' },
    { content: '1200', property: 'og:image:width' },
    { content: '630', property: 'og:image:height' },
    { content: title, property: 'og:image:alt' },
  ]

  const links = [{ href: pageUrl, rel: 'canonical' }]

  return { links, meta }
}
