import { GITHUB_REPO_NAME, GITHUB_REPO_OWNER } from '@tamery/shared/constants'
import { type } from 'arktype'

import { octokit } from '~/lib/octokit'
import { cacheMiddleware, orpc } from '~/orpc'

const listPublishedReleases = async () => {
  const { data } = await octokit.repos.listReleases({
    owner: GITHUB_REPO_OWNER,
    repo: GITHUB_REPO_NAME,
  })

  return data.filter(
    (release) => !release.draft && !release.tag_name.startsWith('cli-v')
  )
}

export const releases = orpc.use(cacheMiddleware(60 * 60)).handler(async () => {
  const data = await listPublishedReleases()

  return data.map((release) => ({
    body: release.body,
    createdAt: release.created_at,
    id: release.id,
    name: release.name,
    publishedAt: release.published_at,
    tagName: release.tag_name,
  }))
})

const IMAGE_PATTERN =
  /!\[[^\]]*\]\(\s*<?(?<markdown>[^)\s>]+)|<img\s[^>]*?src="(?<html>[^"]+)"/u

export const releaseAnnouncement = orpc
  .use(cacheMiddleware(60 * 60))
  .input(type({ version: 'string > 0' }))
  .handler(async ({ input }) => {
    const data = await listPublishedReleases()
    const body = data.find(
      (release) => release.tag_name === `v${input.version}`
    )?.body
    const image = body && IMAGE_PATTERN.exec(body)?.groups

    if (!image) {
      return null
    }

    const summary = body
      .split(/\r?\n\s*\r?\n/u)
      .map((paragraph) => paragraph.replaceAll(/\s+/gu, ' ').trim())
      .find((paragraph) => paragraph && !/^(?:#|-|\*|!\[|<)/u.test(paragraph))

    return { image: image.markdown ?? image.html, summary: summary ?? null }
  })
