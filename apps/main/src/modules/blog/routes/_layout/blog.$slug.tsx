import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@tamery/ui/components/badge'
import { responseVariants } from '@tamery/ui/components/response.utils'
import { cn } from '@tamery/ui/lib/utils'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { format, parseISO } from 'date-fns'
import type { Graph } from 'schema-dts'

import { seo, SITE_URL } from '~/utils/seo'

import { postBodies } from '../../bodies'
import { mdxComponents } from '../../components/mdx-components'
import { BLOG_AUTHOR, findPost } from '../../posts'

const BlogPostPage = () => {
  const { post } = Route.useLoaderData()
  const Body = postBodies[post.slug]

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
      <Link
        className="text-muted-foreground hover:text-foreground ease-house mb-10 inline-flex items-center gap-1.5 text-sm transition-colors"
        to="/blog"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} />
        Blog
      </Link>
      <article>
        <header className="mb-10 flex flex-col gap-4">
          <Badge className="w-fit" variant="secondary">
            {post.engine}
          </Badge>
          <h1 className="text-3xl text-balance sm:text-4xl">{post.title}</h1>
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <span>{BLOG_AUTHOR}</span>
            <span aria-hidden>·</span>
            <time dateTime={post.publishedAt}>
              {format(parseISO(post.publishedAt), 'MMMM d, yyyy')}
            </time>
          </div>
        </header>
        <div
          className={cn(
            responseVariants({ variant: 'document' }),
            'text-foreground/90 [&_li]:text-foreground/90 [&_p]:text-foreground/90 [&_td]:text-foreground/80'
          )}
        >
          {Body && <Body components={mdxComponents} />}
        </div>
      </article>
    </main>
  )
}

export const Route = createFileRoute('/_layout/blog/$slug')({
  component: BlogPostPage,
  loader: ({ params }) => {
    const post = findPost(params.slug)
    if (!post || !postBodies[post.slug]) {
      throw notFound()
    }
    return { post }
  },
  head: ({ params }) => {
    const post = findPost(params.slug)
    if (!post) {
      return {}
    }
    const pageUrl = `${SITE_URL}/blog/${post.slug}`
    const imagePath = `/blog/${post.slug}/og.png`
    const structuredData = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'TechArticle',
          headline: post.title,
          description: post.description,
          datePublished: post.publishedAt,
          dateModified: post.publishedAt,
          author: { '@type': 'Person', name: BLOG_AUTHOR },
          publisher: { '@id': `${SITE_URL}/#org` },
          image: `${SITE_URL}${imagePath}`,
          mainEntityOfPage: pageUrl,
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'Blog',
              item: `${SITE_URL}/blog`,
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: post.title,
              item: pageUrl,
            },
          ],
        },
      ],
    } satisfies Graph
    return {
      ...seo({
        title: `${post.title} - Tamery`,
        description: post.description,
        path: `/blog/${post.slug}`,
        image: imagePath,
        article: { publishedTime: post.publishedAt, author: BLOG_AUTHOR },
      }),
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify(structuredData),
        },
      ],
    }
  },
})
