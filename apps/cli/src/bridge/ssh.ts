import process from 'node:process'

import { log } from '@clack/prompts'
import { forwarding } from '@tamery/connection/forwarding'
import type { ConfirmHostKey } from '@tamery/connection/ssh/host-key'
import { tunnelForwarding } from '@tamery/connection/ssh/tunnel'

import { paint } from '../paint'
import { printable } from './printable'
import { askInTerminal } from './terminal-question'

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

export const enableSshTunnels = () =>
  forwarding.use((connectionString) =>
    tunnelForwarding(connectionString, confirmHostKey)
  )
