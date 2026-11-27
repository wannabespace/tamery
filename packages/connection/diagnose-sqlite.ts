import { ConnectionType, Provider } from '@tamery/shared/enums/connection-type'

import type { ConnectionParts } from './connection-parts'
import type { DiagnosisRule } from './diagnosis'
import { isLocalHost } from './hosts'

const TURSO_HOST = /\.turso\.io\.?$/iu

/** Every `libsql://` URL parses as Turso, a self-hosted libSQL server's too. */
const isTurso = ({ host }: ConnectionParts) => TURSO_HOST.test(host)

const NO_ANSWER_HINT =
  'The request never got an answer. Check your internet connection, VPN or proxy, then try again.'

const getUnreachableDiagnosis = (parts: ConnectionParts) => {
  if (parts.provider === Provider.CloudflareD1) {
    return { hint: NO_ANSWER_HINT, title: "Couldn't reach Cloudflare's API" }
  }
  if (isTurso(parts)) {
    return { hint: NO_ANSWER_HINT, title: "Couldn't reach Turso" }
  }
  return {
    hint: isLocalHost(parts.host)
      ? 'Nothing answers at that address. Start the libSQL server, or check the port in the database URL.'
      : NO_ANSWER_HINT,
    title: "Couldn't reach the libSQL server",
  }
}

const RULES: Omit<DiagnosisRule, 'engine'>[] = [
  {
    diagnose: ({ parts }) => getUnreachableDiagnosis(parts),
    // D1's and libSQL's transport failure, before the network rules, which would blame D1's fixed Cloudflare host.
    // Also reads the socket code some builds put after it; `d1.ts` sends the bare form, because an older app blames the fixed host for that code.
    match: /^fetch failed(?:: [A-Z_]+)?$/iu,
    offline: 'host',
    providers: [Provider.CloudflareD1, Provider.Turso],
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
    diagnose: ({ parts }) => {
      if (parts.provider === Provider.CloudflareD1) {
        return {
          focus: 'password',
          hint: 'Use an API token with the D1 Edit permission on this account, made under My Profile → API Tokens, and check the account ID.',
          title: 'Cloudflare refused the API token',
        }
      }
      return isTurso(parts)
        ? {
            focus: 'password',
            hint: 'Create a token for this database on its page in the Turso dashboard, or with `turso db tokens create`.',
            title: 'Turso refused the auth token',
          }
        : {
            focus: 'password',
            hint: 'Use a token signed with the key the server was started with, or leave the token empty if the server needs none.',
            title: 'The libSQL server refused the auth token',
          }
    },
    match: /^authentication error$|server returned http status 40[013]\b/iu,
  },
  {
    diagnose: ({ parts }) =>
      isTurso(parts)
        ? {
            hint: 'Copy the database URL from its page in the Turso dashboard: the host carries the database, organization and region.',
            title: "Turso can't find that database",
          }
        : {
            hint: 'Something answers at that address, but serves no libSQL database there. Check the database URL.',
            title: "The libSQL server can't find that database",
          },
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
