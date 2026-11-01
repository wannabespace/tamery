/**
 * The only sites whose scripts may call the API or the proxy with a user's session. The session cookie is set for every
 * `*.tamery.app` host, so a wildcard here would let a script on any of them (docs, a download host, a dangling DNS
 * record) read `connections.list`.
 */
export const ORIGINS = {
  share: 'https://share.tamery.app',
  site: 'https://tamery.app',
  web: 'https://web.tamery.app',
} as const

/** Portless serves every app in development as `https://<name>.local.tamery.app`. */
export const isDevelopmentOrigin = (origin: string) =>
  origin.startsWith('http://localhost:') ||
  (URL.parse(origin)?.hostname.endsWith('.local.tamery.app') ?? false)
