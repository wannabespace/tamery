import { connectionParts } from './connection-parts'
import type { DiagnosisContext } from './diagnosis'
import type { HostKind } from './hosts'
import { getHostHint, getHostKind, HOST_HINTS } from './hosts'
import { SSH_ELSEWHERE, SSH_HOST_TIMEOUT, tunnelError } from './ssh/params'

const HOST_KIND_LABELS: Record<HostKind, string> = {
  'ipv6-only': 'direct host (IPv6-only)',
  local: 'localhost',
  private: 'private network',
  public: 'public host',
  service: 'single-label name (Docker service?)',
}
const HOST_KINDS = new Set(
  ['', ...HOST_HINTS.map(({ label }) => label)].flatMap((hint) =>
    Object.values(HOST_KIND_LABELS).map((kind) =>
      [hint, kind].filter(Boolean).join(' ')
    )
  )
)
const PORT = /^\d{1,5}$/u

const HEX_GROUP = '[\\da-f]{1,4}'
const ANY_IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/gu
const ANY_IPV6 = new RegExp(
  `(?<![\\w:])(?:(?:${HEX_GROUP}:){7}${HEX_GROUP}|(?:${HEX_GROUP}(?::${HEX_GROUP})*)?::(?:${HEX_GROUP}(?::${HEX_GROUP})*)?)(?:%[\\w.]+)?(?![\\w:])`,
  'giu'
)

const tunnelFailure = (text: string) => tunnelError(text).message
/** What the AI gets for an SSH or tunnel failure, whose text can name the host `~/.ssh/config` resolved or the SSH host's own words. */
const SSH_FAILURES: [RegExp, string][] = [
  [/tunnels run in the Tamery desktop/iu, SSH_ELSEWHERE],
  [
    /docker|container/iu,
    tunnelFailure("The SSH host couldn't find the database container"),
  ],
  [
    /channel|forward/iu,
    tunnelFailure("The SSH host didn't forward the connection to the database"),
  ],
  [
    /\.ssh\/config|line break|match criteria|proxy(?:jump|command)/iu,
    tunnelFailure("~/.ssh/config couldn't be used"),
  ],
  [
    /host.{0,3}key|known_hosts/iu,
    tunnelFailure("The SSH host's key wasn't trusted"),
  ],
  [
    /authenticat|passphrase|private key|key file|agent|password/iu,
    tunnelFailure('SSH sign-in failed'),
  ],
  [/timed out|timeout/iu, tunnelFailure(SSH_HOST_TIMEOUT)],
  [/refused/iu, tunnelFailure('The SSH host refused the connection')],
  [
    /reach|enotfound|eai_again|resolve|not known/iu,
    tunnelFailure("Can't reach the SSH host"),
  ],
]
const SSH_FAILURE = tunnelFailure('SSH connection failed')
const SSH_FAILURE_TEXTS = new Set([
  SSH_FAILURE,
  ...SSH_FAILURES.map(([, text]) => text),
])
const SSH_MARKER =
  /ssh|tunnel|channel open|docker|known_hosts|line break|match criteria|proxy(?:jump|command)/iu
const PLACEHOLDER = /<[^\s<>]+>/u
// An older renderer wrote a placeholder over every word equal to a form value, an SSH failure's own words included, so once one appears only a known driver error keeps its wording.
const DATABASE_ERROR =
  /does not exist|authentication failed|access denied|login failed|unknown database|permission denied|pg_hba\.conf|too many connections|cannot open database|ssl|tls|certificate/iu

/** With a tunnel on, an error reaches the AI as written only when it is a database's own; an SSH failure goes as one of the fixed texts above. */
const withoutSshText = (error: string) =>
  SSH_FAILURE_TEXTS.has(error) ||
  (!SSH_MARKER.test(error) &&
    (!PLACEHOLDER.test(error) || DATABASE_ERROR.test(error)))
    ? error
    : (SSH_FAILURES.find(([pattern]) => pattern.test(error))?.[1] ??
      SSH_FAILURE)

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

const redactOptions = (options: string) =>
  new URLSearchParams(
    [...new URLSearchParams(options)].filter(([key, value]) =>
      isNonIdentifying(key, value)
    )
  ).toString()

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
    error: parts.ssh ? withoutSshText(error) : error,
    hostKind: [
      getHostHint(parts.host)?.label,
      HOST_KIND_LABELS[getHostKind(parts.host)],
    ]
      .filter(Boolean)
      .join(' '),
    options: redactOptions(parts.options),
    passwordSet: !!parts.password,
    port: PORT.test(port) ? port : '',
    sshEnabled: !!parts.ssh,
    type: parts.type,
    userSet: !!parts.user,
  }
}

export type DiagnosisRequest = ReturnType<typeof getDiagnosisRequest>

/** The API runs this on every request: installed apps send what their own renderer wrote, option names, hosts and tunnel details included. */
export const sanitizeDiagnosisRequest = <Request extends DiagnosisRequest>(
  request: Request
): Request => ({
  ...request,
  error: request.sshEnabled ? withoutSshText(request.error) : request.error,
  hostKind: HOST_KINDS.has(request.hostKind) ? request.hostKind : '',
  options: redactOptions(request.options),
  port: PORT.test(request.port) ? request.port : '',
})
