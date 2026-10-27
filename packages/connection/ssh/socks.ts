import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import type { AddressInfo, Server, Socket } from 'node:net'
import type { Duplex } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { silently } from '@tamery/shared/utils'

interface SocksServer extends Server {
  useAuth: (auth: unknown) => void
}

// The package ships no types; this is the part of its API Tamery calls.
interface Socks {
  auth: {
    UserPassword: (
      check: (
        user: string,
        password: string,
        done: (ok: boolean) => void
      ) => void
    ) => unknown
  }
  createServer: (
    onConnection: (
      target: { dstAddr: string; dstPort: number },
      accept: (intercept: true) => Socket | undefined
    ) => void
  ) => SocksServer
}

const LOOPBACK = '127.0.0.1'

const secret = () => randomBytes(24).toString('hex')

/** Opens the byte channel to one target the driver dials: an SSH tunnel on the desktop, a validated TCP socket in the proxy. */
export type OpenChannel = (target: {
  host: string
  port: number
}) => Duplex | Promise<Duplex>

const forward = async (
  client: Socket,
  open: OpenChannel,
  host: string,
  port: number
) => {
  let channel: Duplex
  try {
    channel = await open({ host, port })
  } catch {
    // A target the guard refuses ends the driver's connection here instead of reaching the host.
    client.destroy()
    return
  }
  void silently(() => pipeline(client, channel, client))
}

/**
 * Serves `open` as a SOCKS5 proxy for a driver that takes no stream and dials every server it discovers.
 * It listens on loopback only, and its random credentials keep any other local process from using it.
 */
export const socksProxy = async (open: OpenChannel) => {
  // Loaded only where a proxy is needed — an SSH tunnel or the cloud egress guard — so other processes never require it.
  const socks = createRequire(import.meta.url)('@mongodb-js/socksv5') as Socks
  const proxyUsername = secret()
  const proxyPassword = secret()
  const server = socks.createServer(({ dstAddr, dstPort }, accept) => {
    const client = accept(true)
    if (client) {
      void forward(client, open, dstAddr, dstPort)
    }
  })
  server.useAuth(
    socks.auth.UserPassword((user, password, done) =>
      done(user === proxyUsername && password === proxyPassword)
    )
  )
  server.listen(0, LOOPBACK)
  await once(server, 'listening')
  const { port } = server.address() as AddressInfo
  return {
    close: () => server.close(),
    options: {
      proxyHost: LOOPBACK,
      proxyPassword,
      proxyPort: port,
      proxyUsername,
    },
  }
}
