import { connectionParts } from './connection-parts'
import type { DiagnosisContext } from './diagnosis'
import type { HostKind } from './hosts'
import { getHostHint, getHostKind } from './hosts'
import {
  SSH_HOST_TIMEOUT_AT,
  SSH_HOST_UNREACHABLE_AT,
  SSH_TUNNEL_ERROR,
} from './ssh/params'

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
const RESOLVED_SSH_HOST = new RegExp(
  `(?<=^${RegExp.escape(SSH_TUNNEL_ERROR)}(?:${RegExp.escape(SSH_HOST_TIMEOUT_AT)}|${RegExp.escape(SSH_HOST_UNREACHABLE_AT)})).+?(?=: [^:]+$|$)`,
  'u'
)
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

export const getDiagnosisRequest = ({
  message,
  parts,
}: Pick<DiagnosisContext, 'message' | 'parts'>) => {
  const port = connectionParts.port(parts)
  const options = [...new URLSearchParams(parts.options)].map(
    ([key, value]) => ({
      key,
      shown:
        SETTING_KEYS.has(key.toLowerCase()) &&
        NON_IDENTIFYING_VALUE.test(value),
      value,
    })
  )
  const identifying: [string | undefined, string][] = [
    ...options
      .filter(({ shown }) => !shown)
      .map(({ key, value }): [string, string] => [value, `<${key}>`]),
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
  let error = message.replace(RESOLVED_SSH_HOST, '<ssh-host>')
  // A driver may echo the string's own percent-encoded form.
  for (const [value, placeholder] of identifying
    .flatMap(([text, label]): [string, string][] =>
      text && text.length > 1
        ? [
            [text, label],
            [encodeURIComponent(text), label],
          ]
        : []
    )
    .toSorted(([a], [b]) => b.length - a.length)) {
    error = error.replaceAll(value, placeholder)
  }
  return {
    // IPv4 goes first: an IPv4-mapped IPv6 address would otherwise keep its IPv4 tail.
    error: error.replaceAll(ANY_IPV4, '<ip>').replaceAll(ANY_IPV6, '<ip>'),
    hostKind: [
      getHostHint(parts.host)?.label,
      HOST_KIND_LABELS[getHostKind(parts.host)],
    ]
      .filter(Boolean)
      .join(' '),
    options: new URLSearchParams(
      options.map(({ key, shown, value }) => [
        key,
        shown ? value : '<redacted>',
      ])
    ).toString(),
    passwordSet: !!parts.password,
    port: /^\d{1,5}$/u.test(port) ? port : '',
    sshEnabled: !!parts.ssh,
    type: parts.type,
    userSet: !!parts.user,
  }
}
