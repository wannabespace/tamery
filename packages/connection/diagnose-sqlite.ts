import { ConnectionType, Provider } from '@tamery/shared/enums/connection-type'

import type { ConnectionParts } from './connection-parts'
import type { DiagnosisRule } from './diagnosis'

const TURSO_HOST = /\.turso\.io$/iu

const getUnreachableTitle = ({ host, provider }: ConnectionParts) => {
  if (provider === Provider.CloudflareD1) {
    return "Couldn't reach Cloudflare's API"
  }
  return TURSO_HOST.test(host)
    ? "Couldn't reach Turso"
    : "Couldn't reach the libSQL server"
}

const RULES: Omit<DiagnosisRule, 'engine'>[] = [
  {
    diagnose: ({ parts }) => ({
      hint: 'The request never got an answer. Check your internet connection, VPN or proxy, then try again.',
      title: getUnreachableTitle(parts),
    }),
    // D1's own transport failure (`d1.ts`), before the network rules, which would blame the fixed Cloudflare host.
    match: /^fetch failed$/iu,
    offline: 'host',
  },
  {
    diagnose: () => ({
      focus: 'database',
      hint: 'Choose the database file itself, not a backup, journal or other file. An encrypted database cannot be opened.',
      title: "That file isn't a SQLite database",
    }),
    match: /file is not a database/iu,
  },
  {
    diagnose: ({ parts }) => ({
      focus: 'database',
      hint: `Tamery looked for it at ${parts.database}. It may have been moved, renamed or deleted, or the path names a folder. Choose the file again.`,
      title: "Can't open the database file",
    }),
    match: /unable to open database file/iu,
  },
  {
    diagnose: ({ parts }) =>
      parts.provider === Provider.CloudflareD1
        ? {
            focus: 'password',
            hint: 'Use an API token with the D1 Edit permission on this account, made under My Profile → API Tokens, and check the account ID.',
            title: 'Cloudflare refused the API token',
          }
        : {
            focus: 'password',
            hint: 'Create a token for this database on its page in the Turso dashboard, or with `turso db tokens create`.',
            title: 'Turso refused the auth token',
          },
    match: /^authentication error$|server returned http status 40[013]\b/iu,
  },
  {
    diagnose: () => ({
      hint: 'Copy the database URL from its page in the Turso dashboard: the host carries the database, organization and region.',
      title: "Turso can't find that database",
    }),
    match: /server returned http status (?:404|502)\b/iu,
  },
  {
    diagnose: () => ({
      focus: 'user',
      hint: "Check the account ID: it is in the database's dashboard URL.",
      title: "Cloudflare can't find that account",
    }),
    match: /could not route to|object identifier is invalid/iu,
  },
  {
    diagnose: () => ({
      focus: 'database',
      hint: "Check the database ID: it is in the database's dashboard URL.",
      title: "Cloudflare can't find that database",
    }),
    match: /database \S+ could not be found/iu,
  },
]

export const SQLITE_RULES: DiagnosisRule[] = RULES.map((rule) => ({
  ...rule,
  engine: ConnectionType.SQLite,
}))
