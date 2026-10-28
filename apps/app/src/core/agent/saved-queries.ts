import { getCollections } from '~/core/collections'

import type { AgentTarget } from './target'
import { resolveResource } from './target'

const SAVED_QUERIES_LIMIT = 20

/** The user's saved queries for a resource whose name or SQL holds every word of `query`, newest first, so the agent reuses SQL the user already trusts. */
export const searchSavedQueries = ({
  query,
  ...target
}: AgentTarget & { query: string }) => {
  const { resource } = resolveResource(target)
  const terms = query.toLowerCase().split(/\s+/u).filter(Boolean)
  const found = getCollections()
    .queriesCollection.toArray.filter(
      (saved) =>
        saved.connectionResourceId === resource.id &&
        terms.every((term) =>
          `${saved.name}\n${saved.query}`.toLowerCase().includes(term)
        )
    )
    .toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  return {
    queries: found
      .slice(0, SAVED_QUERIES_LIMIT)
      .map(({ name, query: sql, updatedAt }) => ({ name, sql, updatedAt })),
    truncated: found.length > SAVED_QUERIES_LIMIT,
  }
}
