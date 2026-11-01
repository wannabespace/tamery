import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'

import { Octokit } from '@octokit/rest'
import { generateReleaseNotes } from '@tamery/ai/features'
import { GITHUB_REPO_NAME, GITHUB_REPO_OWNER } from '@tamery/shared/constants'
import { silently } from '@tamery/shared/utils'

import { env } from '~/env'
import { orpc } from '~/orpc'

interface ToDesktopWebhookPayload {
  appId: string
  buildId: string
  userId: string
  buildStartedAt: string
  buildEndedAt: string
  appName: string
  appVersion: string
  appNotarizaionBundleId?: string
  electronVersionUsed: string
  electronVersionSpecified: string
  sourcePackageManager: string
  versionControlInfo?: {
    branchName: string
    commitDate: string
    commitId: string
    commitMessage: string
    hasUncommittedChanges: boolean
    repositoryRemoteUrl: string
    versionControlSystemName: string
  }
  releaseInfo: {
    latestReleaseBuildId?: string
    releaseRedirections?: object[]
  }
}

const verifyWebhookSignature = (
  requestBody: string,
  signature: string,
  secret: string
) => {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(requestBody)
    .digest('hex')

  const received = Buffer.from(signature)
  const expected = Buffer.from(expectedSignature)

  return (
    received.length === expected.length &&
    crypto.timingSafeEqual(received, expected)
  )
}

export const todesktop = orpc
  .errors({
    INTERNAL_SERVER_ERROR: {},
    UNAUTHORIZED: {},
  })
  .handler(async ({ context, errors }) => {
    const webhookSecret = env.TODESKTOP_WEBHOOK_SECRET

    if (!webhookSecret) {
      throw errors.INTERNAL_SERVER_ERROR({
        message: 'TODESKTOP_WEBHOOK_SECRET is not set',
      })
    }

    if (!env.GITHUB_TOKEN) {
      throw errors.INTERNAL_SERVER_ERROR({ message: 'GITHUB_TOKEN is not set' })
    }

    const rawBody = await context.request.text()
    const signature = context.request.headers.get('X-ToDesktop-HMAC-SHA256')

    if (!signature) {
      throw errors.UNAUTHORIZED({
        message: 'Missing X-ToDesktop-HMAC-SHA256 header',
      })
    }

    const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret)

    if (!isValid) {
      throw errors.UNAUTHORIZED({ message: 'Invalid webhook signature' })
    }

    try {
      const payload = JSON.parse(rawBody) as ToDesktopWebhookPayload

      const tagName = `v${payload.appVersion}`
      const releaseName = payload.appVersion

      const octokit = new Octokit({
        auth: env.GITHUB_TOKEN,
      })

      const { data: release } = await octokit.rest.repos.createRelease({
        draft: true,
        generate_release_notes: true,
        name: releaseName,
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_REPO_NAME,
        tag_name: tagName,
        target_commitish: payload.versionControlInfo?.commitId || undefined,
      })

      if (release.body) {
        const notes = release.body
        await silently(async () => {
          const body = await generateReleaseNotes({
            notes,
            signal: AbortSignal.timeout(20_000),
          })
          await octokit.rest.repos.updateRelease({
            body,
            owner: GITHUB_REPO_OWNER,
            release_id: release.id,
            repo: GITHUB_REPO_NAME,
          })
        })
      }

      context.addLogData({
        build: {
          appVersion: payload.appVersion,
          id: payload.buildId,
        },
        release: {
          id: release.id,
          tagName: release.tag_name,
          url: release.html_url,
        },
      })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)

      throw errors.INTERNAL_SERVER_ERROR({ message: errorMessage })
    }
  })
