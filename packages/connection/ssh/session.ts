import { once } from 'node:events'

import { hasErrnoCode } from '@tamery/shared/errno'
import { noop, toError } from '@tamery/shared/utils'
import { Result } from 'better-result'
import type { Client, ConnectConfig } from 'ssh2'

import { AGENT_UNAVAILABLE, getSshConfig } from './config'
import type { ConfirmHostKey } from './host-key'
import { HOST_KEY_REFUSALS, hostKeyTrust } from './host-key'
import { knownHosts } from './known-hosts'
import type { SshTunnel } from './params'
import { SSH_AUTH_ERRORS, tunnelError } from './params'

const READY_TIMEOUT = 20_000
// The two errors ssh2's `connect` throws for a key it cannot parse, an encrypted one without its passphrase included.
const SSH2_KEY_ERROR =
  /^(?:Cannot parse privateKey|privateKey value does not contain)/u

const sshErrorMessage = (
  error: Error & { code?: string; level?: string },
  auth: ConnectConfig
) => {
  if (error.level === 'client-authentication') {
    return 'agent' in auth
      ? 'SSH authentication failed: the host accepted no key from your ssh-agent. Add yours with ssh-add, or pick another sign-in method.'
      : 'SSH authentication failed. Check the SSH user and credentials.'
  }
  if (error.level === 'agent') {
    return AGENT_UNAVAILABLE
  }
  if (error.level === 'client-timeout' || hasErrnoCode(error, 'ETIMEDOUT')) {
    return 'Timed out reaching the SSH host'
  }
  if (error.level === 'client-socket') {
    return `Can't reach the SSH host: ${error.code ?? 'connection failed'}`
  }
  return `SSH connection failed: ${error.message}`
}

// ssh2 names the passphrase in both its "no passphrase given" and "bad passphrase?" parse errors, and in nothing else.
const unreadableKey = ({ auth, passphrase }: SshTunnel, error: Error) => {
  if (!/passphrase/iu.test(error.message)) {
    return auth === 'keyPath'
      ? SSH_AUTH_ERRORS.keyFileNotAKey
      : SSH_AUTH_ERRORS.notAKey
  }
  return passphrase
    ? SSH_AUTH_ERRORS.passphraseWrong
    : SSH_AUTH_ERRORS.passphraseNeeded
}

export const connectSsh = async (
  tunnel: SshTunnel,
  confirmHostKey: ConfirmHostKey
): Promise<Client> => {
  const { auth, hashKnownHosts, host, hostKeyName, port, username } =
    await getSshConfig(tunnel)
  const known = await knownHosts.read()
  const listedAlgorithms = knownHosts.listedAlgorithms(known, hostKeyName)
  const { Client: SshClient } = await import('ssh2')
  const client = new SshClient().on('error', noop)
  let closed = false
  client.once('close', () => {
    closed = true
  })
  let refusal: string | undefined
  let verifiedKey: Buffer | undefined
  let readyTimer: ReturnType<typeof setTimeout> | undefined
  const startReadyTimer = () => {
    readyTimer = setTimeout(() => {
      client.emit(
        'error',
        Object.assign(new Error('Timed out while waiting for handshake'), {
          level: 'client-timeout',
        })
      )
      client.end()
    }, READY_TIMEOUT)
  }

  const isTrusted = async (key: Buffer) => {
    if (verifiedKey) {
      return verifiedKey.equals(key)
    }
    const status = hostKeyTrust.check(known, hostKeyName, key)
    if (status === 'known') {
      return true
    }
    if (status === 'unknown') {
      clearTimeout(readyTimer)
      const trusted = await hostKeyTrust.confirm(hostKeyName, key, {
        confirm: confirmHostKey,
        hashed: hashKnownHosts,
        isLive: () => !closed,
      })
      if (!closed) {
        startReadyTimer()
      }
      if (trusted) {
        return true
      }
    }
    refusal = HOST_KEY_REFUSALS[status]
    return false
  }
  const verifyHostKey = async (
    key: Buffer,
    verify: (valid: boolean) => void
  ) => {
    const checked = await Result.tryPromise(() => isTrusted(key))
    const trusted = checked.unwrapOr(false)
    if (trusted) {
      verifiedKey = key
    }
    if (!closed) {
      verify(trusted)
    }
  }

  // ssh2 emits only `close`, never `error`, when the host hangs up after its banner (sshd's LoginGraceTime while the host-key prompt is open).
  const hungUp = async () => {
    await once(client, 'close')
    throw new Error('the SSH host closed the connection')
  }
  // `connect` throws synchronously for a key it cannot parse; arming the timer or the race before it leaves an unawaited rejection that crashes the desktop database process.
  const connecting = Result.try(() =>
    client.connect({
      ...auth,
      algorithms: { serverHostKey: listedAlgorithms },
      host,
      // Returns undefined on purpose: ssh2 takes any other return value, a promise included, as the verdict.
      hostVerifier: (key: Buffer, verify: (valid: boolean) => void) => {
        void verifyHostKey(key, verify)
      },
      keepaliveInterval: 10_000,
      port,
      // Replaced by `readyTimer`, which stops while the host-key prompt is open.
      readyTimeout: 0,
      username,
    })
  )
  if (connecting.isErr()) {
    const configError = toError(connecting.error.cause)
    client.end()
    throw tunnelError(
      SSH2_KEY_ERROR.test(configError.message)
        ? unreadableKey(tunnel, configError)
        : sshErrorMessage(configError, auth)
    )
  }
  const ready = Promise.race([once(client, 'ready'), hungUp()])
  startReadyTimer()
  const readied = await Result.tryPromise(() => ready)
  clearTimeout(readyTimer)
  if (readied.isErr()) {
    client.end()
    throw tunnelError(
      refusal ?? sshErrorMessage(toError(readied.error.cause), auth)
    )
  }
  return client
}
