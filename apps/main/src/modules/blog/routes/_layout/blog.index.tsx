import { createFileRoute, Link } from '@tanstack/react-router'
import { format, parseISO } from 'date-fns'

import { seo } from '~/utils/seo'

import { BLOG_AUTHOR, publishedPosts } from '../../posts'

const authorInitials = BLOG_AUTHOR.split(' ')
  .map((part) => part[0])
  .slice(0, 2)
  .join('')

const BlogPage = () => (
  <main className="mx-auto w-full max-w-6xl px-5 pt-16 pb-28 sm:px-6 sm:pt-24">
    <header className="mb-14 flex flex-col gap-4 sm:mb-20">
      <h1 className="text-5xl text-balance sm:text-6xl">Blog</h1>
      <p className="text-muted-foreground max-w-xl text-lg text-pretty">
        Updates, deep dives, and how-tos from the people building Tamery.
      </p>
    </header>
    <ol className="-mx-4 grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {publishedPosts().map((post) => (
        <li key={post.slug}>
          <Link
            className="group hover:bg-accent ease-house flex h-full flex-col gap-3 rounded-2xl p-4 transition-colors"
            params={{ slug: post.slug }}
            to="/blog/$slug"
          >
            <div className="flex items-center gap-2 text-sm">
              <time
                className="text-foreground font-medium"
                dateTime={post.publishedAt}
              >
                {format(parseISO(post.publishedAt), 'd MMMM')}
              </time>
              <span className="text-muted-foreground">{post.engine}</span>
            </div>
            <h2 className="text-foreground text-xl text-pretty">
              {post.title}
            </h2>
            <p className="text-muted-foreground text-pretty">
              {post.description}
            </p>
            <div className="mt-auto flex items-center gap-2 pt-5">
              <span className="bg-foreground/8 text-foreground/70 text-2xs flex size-6 shrink-0 items-center justify-center rounded-full font-medium">
                {authorInitials}
              </span>
              <span className="text-muted-foreground text-sm">
                {BLOG_AUTHOR}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ol>
  </main>
)

export const Route = createFileRoute('/_layout/blog/')({
  component: BlogPage,
  head: () =>
    seo({
      title: 'Blog - Tamery',
      description:
        'Updates, deep dives, and how-tos from the people building Tamery, the AI database client.',
      path: '/blog',
    }),
})
