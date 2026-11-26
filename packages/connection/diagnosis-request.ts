import { connectionParts } from './connection-parts'
import type { DiagnosisContext } from './diagnosis'
import type { HostKind } from './hosts'
import { getHostHint, getHostKind, HOST_HINTS } from './hosts'
import {
  AGENT_UNAVAILABLE,
  dockerDenied,
  HOST_KEY_REFUSALS,
  PROXY_KEYWORDS,
  serviceAmbiguous,
  SSH_AUTH_ERRORS,
  SSH_CONFIG_UNREADABLE,
  SSH_CONNECTION_FAILED,
  SSH_ELSEWHERE,
  SSH_HOST_CLOSED,
  SSH_HOST_TIMEOUT,
  SSH_HOST_TIMEOUT_AT,
  SSH_HOST_UNREACHABLE,
  SSH_HOST_UNREACHABLE_AT,
  SSH_MACHINE_HOST_KEY_UNKNOWN,
  SSH_TUNNEL_ERROR,
  unsupportedProxy,
} from './ssh/params'

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

const SSH_HOST = '<ssh-host>'
const HOST = '<host>'
const PLACEHOLDER = /<[\w-]+>/u
const ANY = '\0'
const SOCKET_CODES = new Set([
  'connection failed',
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTDOWN',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
])
const tunnel = (text: string) => `${SSH_TUNNEL_ERROR}${text}`
const FIXED_SSH_FAILURES = new Set([
  ...[
    ...Object.values(SSH_AUTH_ERRORS),
    ...Object.values(HOST_KEY_REFUSALS),
    ...PROXY_KEYWORDS.map(unsupportedProxy),
    AGENT_UNAVAILABLE,
    SSH_CONFIG_UNREADABLE,
    SSH_CONNECTION_FAILED,
    `${SSH_CONNECTION_FAILED}: ${SSH_HOST_CLOSED}`,
    SSH_HOST_TIMEOUT,
    SSH_MACHINE_HOST_KEY_UNKNOWN,
  ].map(tunnel),
  SSH_ELSEWHERE,
])
const sshTemplate = (text: string, code = false) =>
  new RegExp(
    `^${tunnel(text).split(ANY).map(RegExp.escape).join('.+')}${code ? '(?<code>[^:]+)' : ''}$`,
    'su'
  )
const SSH_TEMPLATES: [RegExp, (code: string) => string][] = [
  [
    sshTemplate(`${SSH_HOST_TIMEOUT_AT}${ANY}`),
    () => tunnel(`${SSH_HOST_TIMEOUT_AT}${SSH_HOST}`),
  ],
  [
    sshTemplate(`${SSH_HOST_UNREACHABLE_AT}${ANY}: `, true),
    (code) => tunnel(`${SSH_HOST_UNREACHABLE_AT}${SSH_HOST}: ${code}`),
  ],
  [
    sshTemplate(SSH_HOST_UNREACHABLE, true),
    (code) => tunnel(`${SSH_HOST_UNREACHABLE}${code}`),
  ],
  [
    sshTemplate(`${SSH_CONFIG_UNREADABLE}: ${ANY}`),
    () => tunnel(SSH_CONFIG_UNREADABLE),
  ],
  [sshTemplate(dockerDenied(ANY)), () => tunnel(dockerDenied(HOST))],
  [
    sshTemplate(serviceAmbiguous(ANY, ANY)),
    () => tunnel(serviceAmbiguous(HOST, '<containers>')),
  ],
]
const SSH_PREFIXES = [SSH_TUNNEL_ERROR, '(SSH) ']
// Older apps and CLIs pass ssh-config's parse error on bare, with the line it stopped at.
const BARE_SSH_CONFIG_ERROR = /^Unexpected line break at /u
// ssh2 writes the SSH host's own description after it; `ssh/docker.ts` reads the unresolved-name wording.
const CHANNEL_FAILURE = /\(SSH\) Channel open failure: (?<reason>.*)/isu
const CHANNEL_REASONS: [RegExp, string][] = [
  [/administratively prohibited/iu, 'administratively prohibited'],
  [/open failed/iu, 'open failed'],
  [/resol|not known|no address/iu, `the SSH host can't resolve ${HOST}`],
]

/** Older apps replaced each value the form holds wherever it occurred, a word of these prefixes included, so a placeholder there still marks a tunnel failure. */
const isSshFailure = (message: string) => {
  const placeholder = message.search(PLACEHOLDER)
  return (
    message.includes(SSH_HOST) ||
    BARE_SSH_CONFIG_ERROR.test(message) ||
    /channel open failure/iu.test(message) ||
    SSH_PREFIXES.some(
      (prefix) =>
        message.startsWith(prefix) ||
        (placeholder !== -1 &&
          placeholder < prefix.length &&
          message.startsWith(prefix.slice(0, placeholder)))
    )
  )
}

/** Sends a tunnel failure only as one of the fixed texts above: the detail ssh2, ssh-config or the SSH host wrote can name the host `~/.ssh/config` resolved. */
const toSshFailure = (message: string) => {
  if (FIXED_SSH_FAILURES.has(message)) {
    return message
  }
  if (!isSshFailure(message)) {
    return null
  }
  if (BARE_SSH_CONFIG_ERROR.test(message)) {
    return tunnel(SSH_CONFIG_UNREADABLE)
  }
  const reason = CHANNEL_FAILURE.exec(message)?.groups?.reason
  if (reason !== undefined) {
    const known = CHANNEL_REASONS.find(([pattern]) => pattern.test(reason))
    return `(SSH) Channel open failure${known ? `: ${known[1]}` : ''}`
  }
  for (const [pattern, write] of SSH_TEMPLATES) {
    const match = pattern.exec(message)
    if (match) {
      const code = match.groups?.code ?? ''
      return write(SOCKET_CODES.has(code) ? code : 'connection failed')
    }
  }
  return tunnel(SSH_CONNECTION_FAILED)
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
    [parts.ssh?.host, SSH_HOST],
    [parts.host, HOST],
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
  const error = message.replaceAll(
    new RegExp(
      replacements.map(([value]) => RegExp.escape(value)).join('|'),
      'gu'
    ),
    (match) => replacements.find(([value]) => value === match)?.[1] ?? match
  )
  return {
    // IPv4 goes first: an IPv4-mapped IPv6 address would otherwise keep its IPv4 tail.
    error:
      (parts.ssh && toSshFailure(message)) ||
      error.replaceAll(ANY_IPV4, '<ip>').replaceAll(ANY_IPV6, '<ip>'),
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
  error: (request.sshEnabled && toSshFailure(request.error)) || request.error,
  hostKind: HOST_KINDS.has(request.hostKind) ? request.hostKind : '',
  options: redactOptions(request.options),
  port: PORT.test(request.port) ? request.port : '',
})
