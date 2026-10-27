import { describeConnectionString } from '../utils'
import { SSH_DESKTOP_ONLY } from './params'
import type { tunnelSocket } from './socket'

export interface Forwarding {
  /** Takes no argument on purpose: pg calls its `stream` option with its own config. */
  socket: () => ReturnType<typeof tunnelSocket>
  /** A channel to another server the SSH host reaches, for a driver that dials hosts it discovers. */
  socketTo: (target: {
    host: string
    port: number
  }) => ReturnType<typeof tunnelSocket>
}

let getForwarding = (connectionString: string): Promise<Forwarding | null> => {
  if (describeConnectionString(connectionString).usesSsh) {
    throw new Error(SSH_DESKTOP_ONLY)
  }
  return Promise.resolve(null)
}

/**
 * Resolves once the SSH session is open, an unknown host key's prompt included, so a driver's connect timeout never runs while the prompt is up.
 * Only the desktop database process plugs tunnels in, so the CLI and proxies, which bundle the dialects, never load ssh2.
 */
export const sshForwarding = {
  of: (connectionString: string) => getForwarding(connectionString),
  use: (open: typeof getForwarding) => {
    getForwarding = open
  },
}
