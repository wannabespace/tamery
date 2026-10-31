import { GitBranchIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { SOCIAL_LINKS } from '@tamery/shared/constants'
import { Badge } from '@tamery/ui/components/badge'
import { Button } from '@tamery/ui/components/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@tamery/ui/components/empty'
import { Response } from '@tamery/ui/components/response'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { Result } from 'better-result'
import { format } from 'date-fns'

import { orpc } from '~/lib/orpc'
import { seo } from '~/utils/seo'

const { useLoaderData } = getRouteApi('/_layout/releases')

const ReleasesPage = () => {
  const { releases } = useLoaderData()

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-16 sm:px-6 sm:pt-24">
      <header className="mb-16 flex max-w-2xl flex-col gap-4">
        <h1 className="text-3xl text-balance sm:text-4xl">Releases</h1>
        <p className="text-muted-foreground text-base text-pretty sm:text-lg">
          New features, fixes and improvements in every version of Tamery.
        </p>
      </header>
      {releases.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={GitBranchIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>Release notes are unavailable</EmptyTitle>
            <EmptyDescription>
              GitHub did not answer. Every release is also listed there.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              render={
                <a
                  href={`${SOCIAL_LINKS.GITHUB}/releases`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Releases on GitHub"
                />
              }
            >
              Open on GitHub
            </Button>
          </EmptyContent>
        </Empty>
      )}
      <ol className="flex flex-col gap-16">
        {releases.map((release, index) => (
          <li
            key={release.id}
            className="grid gap-3 md:grid-cols-[12rem_1fr] md:gap-12"
          >
            <div className="flex items-center gap-2 md:sticky md:top-24 md:flex-col md:items-start md:self-start md:pt-1.5">
              {release.publishedAt && (
                <time
                  dateTime={release.publishedAt}
                  className="text-muted-foreground text-sm"
                >
                  {format(new Date(release.publishedAt), 'MMMM d, yyyy')}
                </time>
              )}
              {index === 0 && <Badge variant="secondary">Latest</Badge>}
            </div>
            <article className="flex max-w-3xl min-w-0 flex-col gap-4">
              <h2 className="text-2xl">{release.name || release.tagName}</h2>
              {release.body && (
                <Response variant="document" mode="static">
                  {release.body}
                </Response>
              )}
            </article>
          </li>
        ))}
      </ol>
    </main>
  )
}

export const Route = createFileRoute('/_layout/releases')({
  component: ReleasesPage,
  head: () =>
    seo({
      title: 'Releases - Tamery',
      description:
        'View the latest Tamery releases, changelogs, and version history. Stay up to date with new features and improvements.',
      path: '/releases',
    }),
  loader: async () => {
    const releases = await Result.tryPromise(() => orpc.releases.call())
    return { releases: releases.unwrapOr([]) }
  },
})
