import { glob, readFile } from 'node:fs/promises'
import { homedir, userInfo } from 'node:os'
import path from 'node:path'

import { Result } from 'better-result'
import type { ConnectConfig } from 'ssh2'

import { knownHosts } from './known-hosts'
import type { SshTunnel } from './params'
import { DEFAULT_SSH_PORT, SSH_AUTH_ERRORS, tunnelError } from './params'

export const AGENT_UNAVAILABLE =
  'SSH agent not available. Start ssh-agent or pick another method.'

const MAX_INCLUDE_DEPTH = 16
const INCLUDE = /^\s*include[\s=]+(?<patterns>.+)$/iu
const PROXY_KEYWORDS = ['ProxyJump', 'ProxyCommand']

const expandHome = (file: string) => file.replace(/^~(?=$|\/)/u, homedir())

/** Inlines each `Include`, which ssh-config keeps as a plain directive. Unlike OpenSSH, an Include inside a Host block leaves the included file's last Host active for the lines after it. */
const readConfigFile = async (file: string, depth = 0): Promise<string> => {
  const contents = await Result.tryPromise(() => readFile(file, 'utf-8'))
  if (contents.isErr() || depth > MAX_INCLUDE_DEPTH) {
    return ''
  }
  const lines = await Promise.all(
    contents.value.split('\n').map(async (line) => {
      const patterns = INCLUDE.exec(line)?.groups?.patterns
      if (!patterns) {
        return line
      }
      const matches = await Promise.all(
        patterns
          .trim()
          .split(/\s+/u)
          .map((pattern) =>
            Array.fromAsync(
              glob(path.resolve(homedir(), '.ssh', expandHome(pattern)))
            )
          )
      )
      const included = await Promise.all(
        matches.flatMap((files) =>
          files.toSorted().map((match) => readConfigFile(match, depth + 1))
        )
      )
      return included.join('\n')
    })
  )
  return lines.join('\n')
}

const getAuth = async (
  tunnel: SshTunnel,
  sshConfig: (key: string) => string | undefined
): Promise<ConnectConfig> => {
  // ssh2 tries to decrypt with an empty passphrase rather than report the key as encrypted.
  const passphrase = tunnel.passphrase || undefined
  if (tunnel.auth === 'password') {
    if (!tunnel.password) {
      throw tunnelError(SSH_AUTH_ERRORS.passwordMissing)
    }
    return { password: tunnel.password }
  }
  if (tunnel.auth === 'key') {
    if (!tunnel.privateKey) {
      throw tunnelError(SSH_AUTH_ERRORS.privateKeyMissing)
    }
    return { passphrase, privateKey: tunnel.privateKey }
  }
  if (tunnel.auth === 'keyPath') {
    const keyPath = tunnel.keyPath || sshConfig('IdentityFile')
    if (!keyPath) {
      throw tunnelError(SSH_AUTH_ERRORS.noKeyFile)
    }
    const privateKey = await Result.tryPromise(() =>
      readFile(expandHome(keyPath))
    )
    if (privateKey.isErr()) {
      throw tunnelError(SSH_AUTH_ERRORS.keyFileMissing)
    }
    return { passphrase, privateKey: privateKey.value }
  }
  // Windows' OpenSSH agent sets no SSH_AUTH_SOCK: it always listens on this pipe.
  const agent =
    sshConfig('IdentityAgent') ??
    process.env.SSH_AUTH_SOCK ??
    (process.platform === 'win32'
      ? String.raw`\\.\pipe\openssh-ssh-agent`
      : null)
  if (!agent) {
    throw tunnelError(AGENT_UNAVAILABLE)
  }
  return { agent: expandHome(agent) }
}

export const getSshConfig = async (tunnel: SshTunnel) => {
  const { parse } = await import('ssh-config')
  const userConfig = await readConfigFile(
    path.join(homedir(), '.ssh', 'config')
  )
  // OpenSSH keywords are case-insensitive, and `Match exec` runs through spawnSync, which would freeze the desktop database process.
  const computed = parse(userConfig).compute(tunnel.host, {
    ignoreCase: true,
    matchExec: false,
  })
  const sshConfig = (key: string): string | undefined =>
    [computed[key.toLowerCase()]].flat()[0]
  const proxy = PROXY_KEYWORDS.find((keyword) => {
    const value = sshConfig(keyword)
    return value && value.toLowerCase() !== 'none'
  })
  if (proxy) {
    throw tunnelError(
      `${proxy} in ~/.ssh/config isn't supported yet. Use an SSH host Tamery can reach directly.`
    )
  }
  const host =
    sshConfig('HostName')?.replaceAll('%h', tunnel.host) ?? tunnel.host
  const port = Number(tunnel.port || sshConfig('Port') || DEFAULT_SSH_PORT)
  return {
    auth: await getAuth(tunnel, sshConfig),
    hashKnownHosts: sshConfig('HashKnownHosts')?.toLowerCase() === 'yes',
    host,
    hostKeyName: knownHosts.getName({
      alias: sshConfig('HostKeyAlias'),
      host,
      port,
    }),
    port,
    username: tunnel.user || sshConfig('User') || userInfo().username,
  }
}
