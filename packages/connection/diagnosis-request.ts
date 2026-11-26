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
// ssh2 writes the SSH host's own description after it; `ssh/docker.ts` reads the unresolved-name wording.
const CHANNEL_FAILURE = '(SSH) Channel open failure'
const CHANNEL_REASONS: [RegExp, string][] = [
  [/administratively prohibited/iu, 'administratively prohibited'],
  [/open failed/iu, 'open failed'],
  [/resol|not known|no address/iu, `the SSH host can't resolve ${HOST}`],
]
const toChannelFailure = (reason: string) => {
  const known = CHANNEL_REASONS.find(([pattern]) => pattern.test(reason))
  return known ? `${CHANNEL_FAILURE}: ${known[1]}` : CHANNEL_FAILURE
}
const toTunnelFailure = (detail: string) => {
  const message = tunnel(detail)
  if (FIXED_SSH_FAILURES.has(message)) {
    return message
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
/** Text only an SSH or tunnel failure carries, with what follows it. The last two are ssh-config's parse errors, which older apps and CLIs pass on bare. */
const SSH_SIGNATURES: [string, (rest: string) => string][] = [
  [SSH_TUNNEL_ERROR, toTunnelFailure],
  ['Channel open failure', toChannelFailure],
  ['Unexpected line break at ', () => tunnel(SSH_CONFIG_UNREADABLE)],
  ['Missing value for match criteria ', () => tunnel(SSH_CONFIG_UNREADABLE)],
]

interface Token {
  end: number
  start: number
  /** Undefined for a placeholder. */
  text?: string
}

const placeholderEnd = (message: string, start: number) => {
  let depth = 0
  for (let index = start; index < message.length; index += 1) {
    const char = message.charAt(index)
    if (/\s/u.test(char)) {
      return null
    }
    depth += char === '<' ? 1 : 0
    depth -= char === '>' ? 1 : 0
    if (depth === 0) {
      return index > start + 1 ? index + 1 : null
    }
  }
  return null
}

/** A placeholder an older renderer wrote holds no space and may nest: an alias `SSH` and a database `ssh` give `<<database>-host>`. */
const tokenize = (message: string) => {
  const tokens: Token[] = []
  for (let start = 0; start < message.length;) {
    const end = message[start] === '<' ? placeholderEnd(message, start) : null
    tokens.push(
      end ? { end, start } : { end: start + 1, start, text: message[start] }
    )
    start = end ?? start + 1
  }
  return tokens
}

interface Step {
  literal: number
  start: number
}

/**
 * Where `signature` occurs in the message with any run of its characters possibly replaced by one placeholder, as an
 * older renderer replaced each form value wherever it appeared. At least half of it must survive as text, so a
 * placeholder alone (a database named `database`) never makes a driver error look like a tunnel failure.
 */
const findLoosely = (tokens: Token[], signature: string) => {
  let steps: (Step | undefined)[] = []
  let found: { end: number; start: number } | undefined
  for (const token of tokens) {
    const next: (Step | undefined)[] = []
    const advance = (to: number, step: Step) => {
      if (step.literal > (next[to]?.literal ?? -1)) {
        next[to] = step
      }
    }
    const current = [{ literal: 0, start: token.start }, ...steps.slice(1)]
    for (const [position, step] of current.entries()) {
      if (!step) {
        continue
      }
      if (token.text === undefined) {
        for (let to = position + 1; to <= signature.length; to += 1) {
          advance(to, step)
        }
      } else if (signature[position] === token.text) {
        advance(position + 1, { ...step, literal: step.literal + 1 })
      }
    }
    const done = next[signature.length]
    if (
      done &&
      done.literal >= signature.length / 2 &&
      (!found || done.start < found.start)
    ) {
      found = { end: token.end, start: done.start }
    }
    steps = next.slice(0, signature.length)
  }
  return found
}

/** Sends a tunnel failure only as one of the fixed texts above: the detail ssh2, ssh-config or the SSH host wrote can name the host `~/.ssh/config` resolved. Returns null for any other error, and the same text for one it returned before. */
const toSshFailure = (message: string) => {
  if (FIXED_SSH_FAILURES.has(message)) {
    return message
  }
  const tokens = tokenize(message)
  const [first] = SSH_SIGNATURES.flatMap(([signature, classify]) => {
    const found = findLoosely(tokens, signature)
    return found ? [{ ...found, classify }] : []
  }).toSorted((a, b) => a.start - b.start)
  return first ? first.classify(message.slice(first.end)) : null
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
