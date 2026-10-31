import { GITHUB_REPO_NAME, GITHUB_REPO_OWNER } from '@tamery/shared/constants'

import { octokit } from '~/lib/octokit'
import { cacheMiddleware, orpc } from '~/orpc'

export const releases = orpc.use(cacheMiddleware(60 * 60)).handler(async () => {
  const { data } = await octokit.repos.listReleases({
    owner: GITHUB_REPO_OWNER,
    repo: GITHUB_REPO_NAME,
  })

  return data
    .filter((release) => !release.draft)
    .map((release) => ({
      body: release.body,
      createdAt: release.created_at,
      id: release.id,
      name: release.name,
      publishedAt: release.published_at,
      tagName: release.tag_name,
    }))
})
