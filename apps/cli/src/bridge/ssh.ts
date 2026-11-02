import process from 'node:process'

import { log } from '@clack/prompts'
import { forwarding } from '@tamery/connection/forwarding'
import type { ConfirmHostKey } from '@tamery/connection/ssh/host-key'
import { tunnelForwarding } from '@tamery/connection/ssh/tunnel'

import { paint } from '../paint'
import { printable } from './printable'
import { askInTerminal } from './terminal-question'

/** A host missing from every known_hosts file is trusted only by the person at the terminal, never by default. */
const confirmHostKey: ConfirmHostKey = async ({
  fingerprint,
  host,
  keyType,
}) => {
  if (!process.stdin.isTTY) {
    log.warn(
      `Refused the SSH host ${paint.bold(printable(host))}: it is not in known_hosts. Connect to it once with ${paint.accent(`ssh ${printable(host)}`)} on this computer, then try again.`
    )
    return false
  }
  return (
    (await askInTerminal(
      `Trust the SSH host ${paint.bold(printable(host))}? Its ${printable(keyType)} key is ${printable(fingerprint)}.`
    )) === true
  )
}

/** Opens the tunnels the desktop app's database process opens, with the same known_hosts and `~/.ssh/config` rules. */
export const enableSshTunnels = () =>
  forwarding.use((connectionString) =>
    tunnelForwarding(connectionString, confirmHostKey)
  )
