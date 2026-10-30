import type { LookupAddress } from 'node:dns'
import { lookup } from 'node:dns/promises'
import { BlockList, connect } from 'node:net'

import { ORPCError } from '@orpc/server'
import { connectionParts } from '@tamery/connection/connection-parts'
import { readConnectionString } from '@tamery/connection/parse-connection-string'
import type { Forwarding } from '@tamery/connection/ssh/forwarding'
import { SSH_DESKTOP_ONLY } from '@tamery/connection/ssh/params'
import { tunnelSocket } from '@tamery/connection/ssh/socket'
import { describeConnectionString } from '@tamery/connection/utils'

const NON_PUBLIC_NETWORKS = new BlockList()
for (const [network, prefix, family] of [
  ['0.0.0.0', 8, 'ipv4'],
  ['10.0.0.0', 8, 'ipv4'],
  ['100.64.0.0', 10, 'ipv4'],
  ['127.0.0.0', 8, 'ipv4'],
  ['169.254.0.0', 16, 'ipv4'],
  ['172.16.0.0', 12, 'ipv4'],
  ['192.0.0.0', 24, 'ipv4'],
  ['192.168.0.0', 16, 'ipv4'],
  ['198.18.0.0', 15, 'ipv4'],
  ['224.0.0.0', 3, 'ipv4'],
  ['::', 128, 'ipv6'],
  ['::1', 128, 'ipv6'],
  ['64:ff9b::', 96, 'ipv6'],
  ['2002::', 16, 'ipv6'],
  ['fe80::', 10, 'ipv6'],
  ['fc00::', 7, 'ipv6'],
  ['ff00::', 8, 'ipv6'],
] as const) {
  NON_PUBLIC_NETWORKS.addSubnet(network, prefix, family)
}

/** The drivers read each of these as a path on the proxy's own disk. */
const FILE_PARAMS = [
  'sslca',
  'sslcert',
  'sslkey',
  'sslrootcert',
  'tlscafile',
  'tlscertificatekeyfile',
  'tlscrlfile',
]

export const PRIVATE_HOST_MESSAGE =
  'The cloud proxy reaches only public hosts. Run `tamery proxy` or open this connection in the desktop app.'

const SRV_SCHEME = 'mongodb+srv'

const isPublic = ({ address, family }: LookupAddress) =>
  !NON_PUBLIC_NETWORKS.check(address, family === 6 ? 'ipv6' : 'ipv4')

const publicAddresses = async (
  hostname: string
): Promise<[LookupAddress, ...LookupAddress[]]> => {
  const [first, ...rest] = await lookup(hostname, { all: true })
  if (!first || ![first, ...rest].every(isPublic)) {
    throw new ORPCError('FORBIDDEN', { message: PRIVATE_HOST_MESSAGE })
  }
  return [first, ...rest]
}

const guardedConnect = async ({
  host,
  port,
}: {
  host: string
  port: number
}) => {
  const [address] = await publicAddresses(host)
  return connect({ family: address.family, host: address.address, port })
}

/**
 * Plugged in as every dialect's socket source, so each socket a driver opens dials an address checked just before: a name
 * re-resolving to a private host after `assertReachable` (DNS rebinding) is refused, and so is a MongoDB replica set
 * member at a literal private IP, which a DNS lookup never sees. Oracle and libsql open their own sockets and skip it.
 */
export const guardedForwarding = (
  connectionString: string
): Promise<Forwarding> => {
  if (describeConnectionString(connectionString).usesSsh) {
    throw new Error(SSH_DESKTOP_ONLY)
  }
  const parts = connectionParts.parse(connectionString)
  const target = { host: parts.host, port: Number(connectionParts.port(parts)) }
  return Promise.resolve({
    socket: () => tunnelSocket(guardedConnect(target)),
    socketTo: (to) => tunnelSocket(guardedConnect(to)),
  })
}

/**
 * A fast pre-check that refuses the seed before the driver starts; `guardedConnect` re-checks every socket a driver opens, the
 * seed included, so this one need not be authoritative. An empty host is refused too: drivers fall back to localhost for it.
 */
export const assertReachable = async (connectionString: string) => {
  const { host, scheme, searchParams } = readConnectionString(connectionString)
  if (FILE_PARAMS.some((param) => searchParams.has(param))) {
    throw new ORPCError('FORBIDDEN', {
      message:
        'The cloud proxy cannot read certificate files. Run `tamery proxy` or open this connection in the desktop app.',
    })
  }
  if (describeConnectionString(connectionString).usesMachineCredentials) {
    throw new ORPCError('FORBIDDEN', {
      message:
        'The cloud proxy cannot sign in with AWS, OIDC or Kerberos credentials. Run `tamery proxy` or open this connection in the desktop app.',
    })
  }
  // An SRV name has no address of its own: the servers it lists are checked by `guardedConnect` as the driver dials them.
  if (host && scheme === SRV_SCHEME) {
    return
  }
  if (!host) {
    throw new ORPCError('FORBIDDEN', { message: PRIVATE_HOST_MESSAGE })
  }
  await publicAddresses(host)
}
