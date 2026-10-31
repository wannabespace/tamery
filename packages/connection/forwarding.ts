import { SSH_DESKTOP_ONLY } from './ssh/params'
import type { tunnelSocket } from './ssh/socket'
import { describeConnectionString } from './utils'

export interface Destination {
  host: string
  port: number
}

export interface Forwarding {
  /** Takes no argument on purpose: pg calls its `stream` option with its own config. */
  socket: () => ReturnType<typeof tunnelSocket>
  /** A socket to the address the driver names itself: a server it discovers or is redirected to, or its URL's own port. */
  socketTo: (destination: Destination) => ReturnType<typeof tunnelSocket>
}

let getForwarding = (connectionString: string): Promise<Forwarding | null> => {
  if (describeConnectionString(connectionString).usesSsh) {
    throw new Error(SSH_DESKTOP_ONLY)
  }
  return Promise.resolve(null)
}

/**
 * Where every dialect client but Oracle and libsql gets its sockets. The desktop database process plugs SSH tunnels in,
 * resolving once the session is open (an unknown host key's prompt included) so a driver's connect timeout never runs
 * while the prompt is up; the cloud proxy plugs in its public-host guard. Nothing else imports ssh2, so the CLI and
 * proxies never load it.
 */
export const forwarding = {
  of: (connectionString: string) => getForwarding(connectionString),
  use: (open: typeof getForwarding) => {
    getForwarding = open
  },
}
