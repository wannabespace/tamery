const IMAGE_ASSET_PREFIX = 'https://github.com/'
const SKIPPED_BLOCK = /^(?:#|[-*+]\s|\d+[.)]\s|>|\||<|!\[)/u

const releaseSummary = (body: string) =>
  body
    .replaceAll(/<!--[\s\S]*?-->/gu, '')
    .replaceAll(/^```[\s\S]*?^```/gmu, '')
    .split(/\r?\n\s*\r?\n/u)
    .map((block) => block.trim())
    .filter((block) => block && !SKIPPED_BLOCK.test(block))
    .map((block) =>
      block
        .replaceAll(/!\[[^\]]*\]\([^)]*\)/gu, '')
        .replaceAll(/\[(?<text>[^\]]*)\]\([^)]*\)/gu, '$<text>')
        .replaceAll(/<[^>]+>|\*\*|__|`/gu, '')
        .replaceAll(/\s+/gu, ' ')
        .trim()
    )
    .find(Boolean) ?? null

export const releaseAnnouncement = (release: {
  assets: { browser_download_url: string; content_type: string }[]
  body?: string | null
}) => {
  const image = release.assets.find(
    (asset) =>
      asset.content_type.startsWith('image/') &&
      asset.browser_download_url.startsWith(IMAGE_ASSET_PREFIX)
  )?.browser_download_url

  if (!image) {
    return null
  }

  return { image, summary: release.body ? releaseSummary(release.body) : null }
}
