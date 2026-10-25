import { ConnectionType } from '@tamery/shared/enums/connection-type'

import type { ConnectionParts } from './connection-parts'
import { NETWORK_RULES } from './diagnose-network'
import { SQLITE_RULES } from './diagnose-sqlite'
import type { Diagnosis, DiagnosisContext, DiagnosisRule } from './diagnosis'
import { getHostHint, isLocalHost } from './hosts'
import { SSH_RULES } from './ssh/diagnose'
import type { SslSetting } from './ssl/setting'
import { getSslOptions } from './ssl/setting'

const sslFix = (
  parts: ConnectionParts,
  setting: SslSetting,
  label: string
): Diagnosis['fix'] => {
  const options = getSslOptions(parts, setting)
  return options ? { label, patch: { options } } : undefined
}

const RULES: DiagnosisRule[] = [
  ...SSH_RULES,
  ...SQLITE_RULES,
  {
    diagnose: () => ({
      focus: 'user',
      hint: 'The sign-in worked, but this user may not open that database. Grant it access, or pick another database or user.',
      title: "This user can't open that database",
    }),
    match:
      /access denied for user .+ to database|permission denied for database|does not have connect privilege|ora-01045/iu,
  },
  {
    diagnose: ({ message, parts }) => {
      const database = /database (?<quote>["'])(?<name>.+?)\k<quote>/iu.exec(
        message
      )?.groups?.name
      // Postgres reads an empty database as the user's name, which rarely exists either.
      const fallback = parts.type === ConnectionType.Postgres ? 'postgres' : ''
      return {
        fix:
          parts.database === fallback
            ? undefined
            : {
                label: 'Use the default database',
                patch: { database: fallback },
              },
        hint: 'Pick an existing database, or use the default one.',
        title: database
          ? `Database "${database}" doesn't exist`
          : "That database doesn't exist",
      }
    },
    match:
      /database "[^"]+" does not exist|unknown database|cannot open database|database '[^']+' does not exist|unknown_database/iu,
  },
  {
    diagnose: ({ message }) => {
      const user = /role "(?<name>[^"]+)" does not exist/iu.exec(message)
        ?.groups?.name
      return {
        focus: 'user',
        hint: 'Use a user that exists on this server. A fresh local Postgres usually has "postgres", or the name of the account that installed it.',
        title: user
          ? `User "${user}" doesn't exist`
          : "That user doesn't exist",
      }
    },
    match: /role "[^"]+" does not exist/iu,
  },
  {
    diagnose: () => ({
      focus: 'user',
      hint: "MySQL only lets this user in from other addresses. Create it for '%' or for your address, or connect from an allowed host.",
      title: "This user can't connect from your address",
    }),
    match: /host '[^']*' is not allowed to connect/iu,
  },
  {
    diagnose: ({ message }) => {
      const service = /service "(?<name>[^"]+)"/iu.exec(message)?.groups?.name
      return {
        focus: 'database',
        hint: 'Use a service the listener knows. A local Oracle Free usually has FREEPDB1, Oracle XE has XEPDB1.',
        title: service
          ? `Service "${service}" isn't on this server`
          : "That service isn't on this server",
      }
    },
    engine: ConnectionType.Oracle,
    match: /is not registered with the listener|ora-12514|ora-12505/iu,
  },
  {
    diagnose: ({ parts }) =>
      new URLSearchParams(parts.options.toLowerCase()).has('authsource')
        ? {
            focus: 'password',
            hint: 'Check the user and password, and the authSource option: it names the database the user was created in.',
            title: 'Wrong user or password',
          }
        : {
            fix: {
              label: 'Sign in through admin',
              patch: {
                options: [parts.options, 'authSource=admin']
                  .filter(Boolean)
                  .join('&'),
              },
            },
            focus: 'password',
            hint: 'MongoDB checks a user against the database in the string unless authSource names another; a root user lives in admin.',
            title: 'Wrong user or password',
          },
    engine: ConnectionType.MongoDB,
    match: /authentication failed/iu,
  },
  {
    diagnose: () => ({
      focus: 'user',
      hint: "Supabase's pooler doesn't know this project: check the project ref in the user (postgres.<project-ref>), and that the project isn't paused.",
      title: "Supabase can't find this project",
    }),
    match: /tenant or user not found/iu,
  },
  {
    diagnose: ({ parts }) => {
      if (
        getHostHint(parts.host)?.projectInUser?.test(parts.host) &&
        !parts.user.includes('.')
      ) {
        return {
          focus: 'user',
          hint: "Supabase's pooler needs the project in the user: postgres.<project-ref>, as in its Session pooler string.",
          title: 'Wrong user for the Supabase pooler',
        }
      }
      return parts.password
        ? {
            focus: 'password',
            hint: 'Check the user and password, and that this user may connect from your address.',
            title: 'Wrong user or password',
          }
        : {
            focus: 'password',
            hint: 'The connection has no password, and the server only lets this user in with one.',
            title: 'This server needs a password',
          }
    },
    // `client password must be a` is node-postgres refusing SCRAM without a password, before the server sees one.
    match:
      /password authentication failed|access denied for user|login failed for user|authentication failed|wrong password|invalid password|password is incorrect|no password supplied|password required|client password must be a|ora-01017/iu,
  },
  {
    diagnose: ({ parts }) => ({
      fix: sslFix(parts, 'on', 'Turn on SSL'),
      hint: 'The server only accepts encrypted connections.',
      title: 'The server requires SSL',
    }),
    match:
      /no pg_hba\.conf entry.*(?:no encryption|ssl off)|ssl connection is required|requires? (?:an )?ssl|insecure transport are prohibited|ssl required|sslmode value "require" invalid/iu,
  },
  {
    diagnose: ({ parts }) => ({
      fix: sslFix(parts, 'on', 'Turn on SSL'),
      hint: 'This MySQL user signs in with caching_sha2_password, which needs an encrypted connection the first time.',
      title: 'This sign-in needs SSL',
    }),
    match: /authentication requires secure connection/iu,
  },
  {
    diagnose: () => ({
      hint: "The server's pg_hba.conf has no rule for this address, user and database. Add one, or allow your IP in the provider's network settings.",
      title: "The server doesn't accept connections from here",
    }),
    match: /no pg_hba\.conf entry/iu,
  },
  {
    diagnose: ({ parts }) =>
      parts.type === ConnectionType.ClickHouse
        ? {
            fix: { label: 'Use http://', patch: { https: false } },
            hint: "This port answers over plain HTTP. Connect with http://, or use the server's HTTPS port, usually 8443. Only use http:// on a network you trust.",
            title: "This port doesn't use HTTPS",
          }
        : {
            fix: sslFix(parts, 'off', 'Turn off SSL'),
            hint: "The server doesn't speak SSL. Only turn it off on a network you trust.",
            title: "The server doesn't support SSL",
          },
    match:
      /does not support ssl|ssl is not enabled on the server|wrong[ _]version[ _]number|handshake_ssl_error|ssl3_get_record|before secure tls connection was established/iu,
  },
  {
    diagnose: ({ parts }) => ({
      fix: sslFix(parts, 'unverified', 'Skip the certificate check'),
      hint: "The server's certificate isn't signed by an authority this device trusts, or names another host. The connection stays encrypted without the check.",
      title: "Couldn't verify the server's certificate",
    }),
    match:
      /self[- ]signed certificate|unable to verify the first certificate|unable to get (?:local )?issuer certificate|certificate has expired|hostname\/ip does not match|altnames|depth_zero_self_signed/iu,
  },
  {
    // Atlas aborts the TLS handshake with this alert when the IP is not on its access list, so SSL settings are not the fix.
    engine: ConnectionType.MongoDB,
    diagnose: () => ({
      hint: 'MongoDB Atlas ends the handshake this way when your IP is not on its access list. Add your current IP under Network Access in Atlas, or allow it in the server’s firewall, then try again.',
      title: 'Your IP may not be allowed in',
    }),
    match:
      /tlsv1_alert|sslv3_alert|ssl alert number|alert (?:internal error|handshake failure)|handshake failure/iu,
  },
  {
    diagnose: ({ parts }) => ({
      fix: sslFix(parts, 'off', 'Turn off SSL'),
      hint: 'The server ended the encrypted handshake with an alert. It may not expect SSL on this port, or its certificate or TLS settings may be off. Try turning SSL off, or check the server.',
      title: 'The TLS handshake failed',
    }),
    match:
      /tlsv1_alert|sslv3_alert|ssl alert number|alert (?:internal error|handshake failure)|handshake failure/iu,
  },
  ...NETWORK_RULES,
  {
    diagnose: () => ({
      hint: "Close idle sessions, or connect through the provider's pooler in session mode.",
      title: 'The server is out of connections',
    }),
    match:
      /too many connections|too many clients|remaining connection slots|too_many_connections|max_connections|max client connections reached/iu,
  },
  {
    diagnose: () => ({
      hint: 'The database is starting, shutting down or recovering. Wait a moment and test again.',
      title: "The database isn't ready",
    }),
    match:
      /the database system is (?:starting up|shutting down|in recovery mode)|server is (?:in )?shutdown/iu,
  },
  {
    diagnose: () => ({
      hint: 'Often an SSL mismatch: try turning SSL on or off. Also check that this port belongs to this engine.',
      title: 'The server closed the connection',
    }),
    match:
      /econnreset|socket hang up|connection terminated unexpectedly|server closed the connection unexpectedly/iu,
  },
  {
    diagnose: () => ({
      hint: "The server asked for an authentication method the driver can't use. Create the user with mysql_native_password, or update the server's auth plugin.",
      title: 'Unsupported sign-in method',
    }),
    match:
      /auth_switch_plugin_error|client does not support authentication protocol|auth_gssapi|unknown authentication plugin/iu,
  },
]

export const isConnectionFailure = (message: string) =>
  RULES.some(({ match }) => match.test(message))

export const diagnoseConnectionError = (
  context: DiagnosisContext
): Diagnosis | null => {
  const rule = RULES.find(
    ({ engine, match }) =>
      (!engine || engine === context.parts.type) && match.test(context.message)
  )
  if (!rule) {
    return null
  }
  const diagnosis = rule.diagnose(context)
  const { host, password } = context.parts
  if (rule.tunnel || diagnosis.focus || password || isLocalHost(host)) {
    return diagnosis
  }
  return {
    ...diagnosis,
    focus: 'password',
    hint: `${diagnosis.hint} The password is empty too.`,
  }
}
