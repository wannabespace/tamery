import type { HostKeyStatus } from './known-hosts'

export const SSH_AUTH_METHODS = ['agent', 'keyPath', 'key', 'password'] as const

export type SshAuth = (typeof SSH_AUTH_METHODS)[number]

export interface SshTunnel {
  auth: SshAuth
  host: string
  keyPath: string
  passphrase: string
  password: string
  port: string
  privateKey: string
  user: string
}

export const EMPTY_SSH_TUNNEL: SshTunnel = {
  auth: 'agent',
  host: '',
  keyPath: '',
  passphrase: '',
  password: '',
  port: '',
  privateKey: '',
  user: '',
}

export const DEFAULT_SSH_PORT = 22

// Errors reach the renderer as bare messages over IPC, so this prefix is the only way `diagnose.ts` tells a tunnel failure from a driver's.
export const SSH_TUNNEL_ERROR = 'SSH tunnel: '

/** The session's own outcomes when this device never reached the SSH host; `diagnose.ts` reads them, and installed apps send them, verbatim. */
export const SSH_HOST_TIMEOUT = 'Timed out reaching the SSH host'
export const SSH_HOST_UNREACHABLE = "Can't reach the SSH host: "
/** Followed by the host `~/.ssh/config` resolved, which the renderer never knows, so `diagnosis-request.ts` redacts what follows them. */
export const SSH_HOST_TIMEOUT_AT = 'Timed out connecting to the SSH host at '
export const SSH_HOST_UNREACHABLE_AT = "Can't reach the SSH host at "
/** Followed by a detail ssh2 or ssh-config wrote, which can name that host too, so `diagnosis-request.ts` sends the AI only these words; installed apps send the first verbatim. */
export const SSH_CONNECTION_FAILED = 'SSH connection failed'
export const SSH_CONFIG_UNREADABLE = "~/.ssh/config couldn't be parsed"
export const SSH_HOST_CLOSED = 'the SSH host closed the connection'

// Every tunnel message below is worded without a host, user or container `~/.ssh/config` or the SSH host supplied: `diagnosis-request.ts` sends the AI only these, and a placeholder where they take the database host.
export const AGENT_UNAVAILABLE =
  'SSH agent not available. Start ssh-agent or pick another method.'

export const HOST_KEY_REFUSALS: Record<
  Exclude<HostKeyStatus, 'known'>,
  string
> = {
  changed:
    "The SSH host presented a key that doesn't match known_hosts, so someone may be impersonating it. If its key changed on purpose, remove the old entry from ~/.ssh/known_hosts (or /etc/ssh/ssh_known_hosts) and connect again.",
  revoked: "The SSH host's key is revoked in known_hosts",
  unknown: "The SSH host's key wasn't trusted",
}

export const SSH_MACHINE_HOST_KEY_UNKNOWN =
  "The machine's computer doesn't know this SSH host's key. Trust it when Tamery asks (update Tamery if it doesn't), or connect to it once with ssh on that computer."

export const PROXY_KEYWORDS = ['ProxyJump', 'ProxyCommand']

export const unsupportedProxy = (keyword: string) =>
  `${keyword} in ~/.ssh/config isn't supported yet. Use an SSH host Tamery can reach directly.`

export const dockerDenied = (host: string) =>
  `The SSH host can't resolve ${host}, and your SSH user can't run docker there to look for a container of that name. Add the user to the docker group.`

export const serviceAmbiguous = (service: string, containers: string) =>
  `Several containers run the service ${service}: ${containers}. Use the container name as the host.`

export const tunnelError = (message: string) =>
  new Error(`${SSH_TUNNEL_ERROR}${message}`)

export const SSH_AUTH_ERRORS = {
  agentKeyRejected:
    'SSH authentication failed: the host accepted no key from your ssh-agent. Add yours with ssh-add, or pick another sign-in method.',
  credentialsRejected:
    'SSH authentication failed. Check the SSH user and credentials.',
  keyFileMissing: "The SSH key file wasn't found. Check its path.",
  keyFileNotAKey: "That file isn't an SSH private key.",
  noKeyFile: 'Choose the SSH key file.',
  notAKey:
    "That isn't an SSH private key. A key runs from -----BEGIN to -----END.",
  passphraseNeeded: 'The SSH key is encrypted. Enter its passphrase.',
  passphraseWrong: "The SSH key couldn't be decrypted. Check its passphrase.",
  passwordMissing: "The SSH password isn't stored on this device",
  privateKeyMissing: "The SSH private key isn't stored on this device",
}

export const SSH_FIELD_AT_FAULT: Record<
  string,
  'ssh.keyPath' | 'ssh.passphrase' | 'ssh.password' | 'ssh.privateKey'
> = {
  [SSH_AUTH_ERRORS.keyFileMissing]: 'ssh.keyPath',
  [SSH_AUTH_ERRORS.keyFileNotAKey]: 'ssh.keyPath',
  [SSH_AUTH_ERRORS.noKeyFile]: 'ssh.keyPath',
  [SSH_AUTH_ERRORS.notAKey]: 'ssh.privateKey',
  [SSH_AUTH_ERRORS.passphraseNeeded]: 'ssh.passphrase',
  [SSH_AUTH_ERRORS.passphraseWrong]: 'ssh.passphrase',
  [SSH_AUTH_ERRORS.passwordMissing]: 'ssh.password',
  [SSH_AUTH_ERRORS.privateKeyMissing]: 'ssh.privateKey',
}

export const SSH_ELSEWHERE =
  'SSH tunnels run in the Tamery desktop app or through `tamery machine`. Open this connection there, or start the machine.'

export const SSH_PARAMS = {
  auth: 'ssh_auth',
  host: 'ssh_host',
  keyPath: 'ssh_key_path',
  passphrase: 'ssh_passphrase',
  password: 'ssh_password',
  port: 'ssh_port',
  privateKey: 'ssh_key',
  user: 'ssh_user',
} as const satisfies Record<keyof SshTunnel, string>

export const getSshTunnel = (
  searchParams: URLSearchParams
): SshTunnel | null => {
  const host = searchParams.get(SSH_PARAMS.host)

  if (!host) {
    return null
  }

  const auth = searchParams.get(SSH_PARAMS.auth)

  return {
    auth: SSH_AUTH_METHODS.find((method) => method === auth) ?? 'agent',
    host,
    keyPath: searchParams.get(SSH_PARAMS.keyPath) ?? '',
    passphrase: searchParams.get(SSH_PARAMS.passphrase) ?? '',
    password: searchParams.get(SSH_PARAMS.password) ?? '',
    port: searchParams.get(SSH_PARAMS.port) ?? '',
    privateKey: searchParams.get(SSH_PARAMS.privateKey) ?? '',
    user: searchParams.get(SSH_PARAMS.user) ?? '',
  }
}

const SSH_PARAM_NAMES = new Set<string>(Object.values(SSH_PARAMS))

/** Matches keys case-insensitively: a raw string's `SSH_HOST` opens a tunnel too, and a driver rejects the leftover param. */
export const deleteSshParams = (searchParams: URLSearchParams) => {
  for (const key of new Set(searchParams.keys())) {
    if (SSH_PARAM_NAMES.has(key.toLowerCase())) {
      searchParams.delete(key)
    }
  }
}

const AUTH_PARAMS: Record<SshAuth, (keyof SshTunnel)[]> = {
  agent: [],
  key: ['privateKey', 'passphrase'],
  keyPath: ['keyPath', 'passphrase'],
  password: ['password'],
}

/** `missing` lists the secrets this device lacks: an empty field writes their empty marker back, so the device keeps asking and the others keep theirs (`connectionSecrets`). */
export const setSshParams = (
  searchParams: URLSearchParams,
  tunnel: SshTunnel,
  missing: readonly string[]
) => {
  for (const key of [
    'host',
    'auth',
    'port',
    'user',
    ...AUTH_PARAMS[tunnel.auth],
  ] as const) {
    const param = SSH_PARAMS[key]
    if (tunnel[key]) {
      searchParams.set(param, tunnel[key])
    } else if (missing.includes(param)) {
      searchParams.set(param, '')
    }
  }
}
