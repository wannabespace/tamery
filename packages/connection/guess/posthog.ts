import { ConnectionType } from '@tamery/shared/enums/connection-type'

import { variablesOfLines } from './env'
import type { ConnectionGuess, DatabaseGuess } from './types'
import { parsedUrlsIn } from './url'

const PERSONAL_API_KEY = /\bphx_\w+/u
const PROJECT_PATH = /^\/project\/(?<project>\d+)/u
const CLOUD_DOMAIN = '.posthog.com'
const BARE_CLOUD_HOST = /^[\w.-]+\.posthog\.com(?:\/\S*)?$/iu
const SELF_HOSTED_NAME = /posthog/iu
const PROJECT_ID_KEYS = ['POSTHOG_PROJECT_ID', 'POSTHOG_ENV_ID']

const INGESTION_HOST = /^(?<region>eu|us)(?:-assets)?\.i\.posthog\.com$/u
const LEGACY_US_HOST = /^app\.posthog\.com$/u

const guessFromUrl = (url: URL, text: string): DatabaseGuess => {
  const variables = variablesOfLines(text.split('\n'))
  return {
    format: 'url',
    parts: {
      database:
        PROJECT_PATH.exec(url.pathname)?.groups?.project ??
        PROJECT_ID_KEYS.map((key) => variables[key]).find(Boolean),
      // An app's `POSTHOG_HOST` names the ingestion host, which refuses the query API.
      host: url.hostname
        .replace(INGESTION_HOST, '$<region>.posthog.com')
        .replace(LEGACY_US_HOST, 'us.posthog.com'),
      password: PERSONAL_API_KEY.exec(text)?.[0],
      port: url.port,
      type: ConnectionType.PostHog,
    },
  }
}

const isPosthogUrl = ({ hostname, pathname }: URL) =>
  hostname.endsWith(CLOUD_DOMAIN) ||
  (SELF_HOSTED_NAME.test(hostname) && PROJECT_PATH.test(pathname))

/** A project's page link, an app's env file or a bare key; keep it after the detectors of database URLs and env files, which an app's `.env` holds beside its PostHog settings. */
export const guessPosthog = (text: string): DatabaseGuess | null => {
  const trimmed = text.trim()
  const url = BARE_CLOUD_HOST.test(trimmed)
    ? URL.parse(`https://${trimmed}`)
    : parsedUrlsIn(text).find(isPosthogUrl)
  if (url) {
    return guessFromUrl(url, text)
  }
  const password = PERSONAL_API_KEY.exec(text)?.[0]
  return password
    ? { format: 'env', parts: { password, type: ConnectionType.PostHog } }
    : null
}

/** PostHog's own Host field: any URL there names the server, self-hosted under any name, and never a ClickHouse. */
export const guessPosthogServer = (text: string): ConnectionGuess | null => {
  const [url] = parsedUrlsIn(text)
  return url ? { ...guessFromUrl(url, text), fixes: [] } : null
}
