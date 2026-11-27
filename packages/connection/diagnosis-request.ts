import { connectionParts } from './connection-parts'
import type { DiagnosisContext } from './diagnosis'
import type { HostKind } from './hosts'
import { getHostHint, getHostKind } from './hosts'
import { SSH_ELSEWHERE, SSH_HOST_TIMEOUT, tunnelError } from './ssh/params'

const HOST_KIND_LABELS: Record<HostKind, string> = {
  'ipv6-only': 'direct host (IPv6-only)',
  local: 'localhost',
  private: 'private network',
  public: 'public host',
  service: 'single-label name (Docker service?)',
}

const HEX_GROUP = '[\\da-f]{1,4}'
const ANY_IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/gu
const ANY_IPV6 = new RegExp(
  `(?<![\\w:])(?:(?:${HEX_GROUP}:){7}${HEX_GROUP}|(?:${HEX_GROUP}(?::${HEX_GROUP})*)?::(?:${HEX_GROUP}(?::${HEX_GROUP})*)?)(?:%[\\w.]+)?(?![\\w:])`,
  'giu'
)

const tunnelFailure = (text: string) => tunnelError(text).message
/** Where an SSH session, the tunnel or ssh-config wrote the failure; a driver may wrap it in its own message. */
const SSH_ENVELOPE =
  /SSH tunnel: |\(SSH\) |Unexpected line break at |Missing value for match criteria |SSH tunnels run in the Tamery desktop/u
const SSH_CATEGORIES: [RegExp, string][] = [
  [/^SSH tunnels run in the Tamery desktop/u, SSH_ELSEWHERE],
  [
    /^\(SSH\) Channel /u,
    tunnelFailure("The SSH host didn't forward the connection to the database"),
  ],
  [
    /^(?:Unexpected line break at|Missing value for match criteria)|^SSH tunnel: (?:Proxy(?:Jump|Command) in )?~\/\.ssh\/config/u,
    tunnelFailure("~/.ssh/config couldn't be used"),
  ],
  [
    /^SSH tunnel: (?:The SSH host can't resolve .+ run docker there|Several containers run the service)/su,
    tunnelFailure("The SSH host couldn't find the database container"),
  ],
  [
    /^SSH tunnel: (?:The SSH host(?:'s key| presented a key)|The machine's computer doesn't know this SSH host's key)/u,
    tunnelFailure("The SSH host's key wasn't trusted"),
  ],
  [
    /^SSH tunnel: (?:SSH authentication failed|SSH agent not available|The SSH key|That (?:file )?isn't an SSH private key|Choose the SSH key file|The SSH (?:password|private key) isn't stored)/u,
    tunnelFailure('SSH sign-in failed'),
  ],
  [
    /^SSH tunnel: Timed out (?:reaching|connecting to) the SSH host/u,
    tunnelFailure(SSH_HOST_TIMEOUT),
  ],
  [
    /^SSH tunnel: Can't reach the SSH host.*: ECONNREFUSED$/su,
    tunnelFailure('The SSH host refused the connection'),
  ],
  [
    /^SSH tunnel: Can't reach the SSH host/u,
    tunnelFailure("Can't reach the SSH host"),
  ],
]
const SSH_FAILURE = tunnelFailure('SSH connection failed')
// Drivers quote every name they echo; masking those keeps a name from reading as a form, and no name can rewrite one.
const QUOTED_NAME = /"(?:[^"]|"")*"|(?<!\w)'(?:[^']|'')*'/gu
// The forms `diagnose.ts` tells apart, most specific first: a TLS or permission failure also reads as an address or sign-in one.
const DATABASE_CATEGORIES: [RegExp, string][] = [
  [
    /access denied for user .+ to database|permission denied for database|does not have connect privilege|ora-01045/iu,
    "Database user can't open that database",
  ],
  [/role "" does not exist/iu, 'Database user does not exist'],
  [
    /cannot open database|database "" does not exist|unknown database|unknown_database/iu,
    'Database does not exist',
  ],
  [
    /no pg_hba\.conf entry.*(?:no encryption|ssl off)|ssl connection is required|requires? (?:an )?ssl|insecure transport are prohibited|ssl required|authentication requires secure connection|sslmode value \S+ invalid/iu,
    'Database requires SSL',
  ],
  [
    /does not support ssl|ssl is not enabled on the server|wrong[ _]version[ _]number|handshake_ssl_error|ssl3_get_record|before secure tls connection was established/iu,
    "Database doesn't support SSL",
  ],
  [
    /self[- ]signed certificate|unable to verify the first certificate|unable to get (?:local )?issuer certificate|certificate has expired|hostname\/ip does not match|altnames|depth_zero_self_signed/iu,
    "Database certificate couldn't be verified",
  ],
  [
    /tlsv1_alert|sslv3_alert|ssl alert number|alert (?:internal error|handshake failure)|handshake failure/iu,
    'Database TLS handshake failed',
  ],
  [
    /no pg_hba\.conf entry|is not allowed to connect|is not allowed to access the server/iu,
    "Database server doesn't allow connections from this address",
  ],
  [
    /password has expired|password .+ must be changed|ora-28001/iu,
    'Database password has expired',
  ],
  [/account is locked|ora-28000/iu, 'Database account is locked'],
  [
    /password authentication failed|access denied for user|login failed for user|authentication failed|wrong password|invalid password|password is incorrect|no password supplied|password required|client password must be a|ora-01017/iu,
    'Database sign-in failed',
  ],
  [
    /too many clients|too many connections|remaining connection slots|connection limit exceeded|too_many_connections|max_connections|max client connections reached/iu,
    'Database has too many connections',
  ],
  [/permission denied/iu, 'Database permission denied'],
  [
    /the database system is (?:starting up|shutting down|in recovery mode)/iu,
    "Database isn't ready",
  ],
  [/connection terminated unexpectedly/iu, 'Database closed the connection'],
  [
    /\betimedout\b|timed out|timeout expired/iu,
    'Connection to the database timed out',
  ],
  [
    /\beconnrefused\b|connection refused|could not connect/iu,
    'Database refused the connection',
  ],
  [
    /\b(?:enotfound|eai_again)\b|getaddrinfo/iu,
    "Database host name couldn't be resolved",
  ],
]
const CONNECTION_FAILURE = 'Connection failed'

/** Every error text the AI may get for a connection with an SSH tunnel. */
export const SSH_ON_ERRORS = new Set([
  ...[...SSH_CATEGORIES, ...DATABASE_CATEGORIES].map(([, text]) => text),
  SSH_FAILURE,
  CONNECTION_FAILURE,
])

/**
 * With a tunnel on, an error can name the host `~/.ssh/config` resolved however it reads, so the AI gets only the
 * category its form points to, read once the names in the text are masked: the SSH envelope, or the database form.
 */
const toCategory = (message: string) => {
  const unquoted = message.replaceAll(QUOTED_NAME, '""')
  const envelope = unquoted.search(SSH_ENVELOPE)
  if (envelope !== -1) {
    const failure = unquoted.slice(envelope)
    return (
      SSH_CATEGORIES.find(([pattern]) => pattern.test(failure))?.[1] ??
      SSH_FAILURE
    )
  }
  return (
    DATABASE_CATEGORIES.find(([pattern]) => pattern.test(unquoted))?.[1] ??
    CONNECTION_FAILURE
  )
}

/** Any other key's value can be a secret or a name, however harmless it looks (`sslpassword=123456`). */
const SETTING_KEYS = new Set([
  'connect_timeout',
  'connecttimeout',
  'encrypt',
  'pgbouncer',
  'ssl',
  'sslmaxversion',
  'sslminversion',
  'sslmode',
  'sslrejectunauthorized',
  'trustservercertificate',
])
const NON_IDENTIFYING_VALUE =
  /^(?:true|false|yes|no|on|off|\d+(?:\.\d+)?|disable|allow|prefer|require|verify|verify-ca|verify-full|no-verify|strict|optional|mandatory|disabled|preferred|required|verify_ca|verify_identity|tlsv1(?:\.[0-3])?)$/iu

const isNonIdentifying = (key: string, value: string) =>
  SETTING_KEYS.has(key.toLowerCase()) && NON_IDENTIFYING_VALUE.test(value)

export const getDiagnosisRequest = ({
  message,
  parts,
}: Pick<DiagnosisContext, 'message' | 'parts'>) => {
  const port = connectionParts.port(parts)
  const hiddenOptions = [...new URLSearchParams(parts.options)]
    .filter(([key, value]) => !isNonIdentifying(key, value))
    .map(([, value]): [string, string] => [value, '<redacted>'])
  const identifying: [string | undefined, string][] = [
    ...hiddenOptions,
    [parts.password, '<password>'],
    [parts.ssh?.password, '<ssh-password>'],
    [parts.ssh?.passphrase, '<ssh-passphrase>'],
    [parts.ssh?.privateKey, '<ssh-key>'],
    [parts.ssh?.host, '<ssh-host>'],
    [parts.host, '<host>'],
    [parts.user, '<user>'],
    [parts.ssh?.user, '<ssh-user>'],
    [parts.database, '<database>'],
  ]
  // A driver may echo the string's own percent-encoded form.
  const replacements = identifying
    .flatMap(([text, label]): [string, string][] =>
      text && text.length > 1
        ? [
            [text, label],
            [encodeURIComponent(text), label],
          ]
        : []
    )
    .toSorted(([a], [b]) => b.length - a.length)
  // One pass, so a value never matches inside a placeholder written before it (a password named `user`).
  const error = message
    .replaceAll(
      new RegExp(
        replacements.map(([value]) => RegExp.escape(value)).join('|'),
        'gu'
      ),
      (match) => replacements.find(([value]) => value === match)?.[1] ?? match
    )
    // IPv4 goes first: an IPv4-mapped IPv6 address would otherwise keep its IPv4 tail.
    .replaceAll(ANY_IPV4, '<ip>')
    .replaceAll(ANY_IPV6, '<ip>')
  return {
    error: parts.ssh ? toCategory(message) : error,
    hostKind: [
      getHostHint(parts.host)?.label,
      HOST_KIND_LABELS[getHostKind(parts.host)],
    ]
      .filter(Boolean)
      .join(' '),
    options: new URLSearchParams(
      [...new URLSearchParams(parts.options)].filter(([key, value]) =>
        isNonIdentifying(key, value)
      )
    ).toString(),
    passwordSet: !!parts.password,
    port: /^\d{1,5}$/u.test(port) ? port : '',
    sshEnabled: !!parts.ssh,
    type: parts.type,
    userSet: !!parts.user,
  }
}
