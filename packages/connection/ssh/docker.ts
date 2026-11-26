import { text } from 'node:stream/consumers'
import { promisify } from 'node:util'

import { Result } from 'better-result'
import type { Client } from 'ssh2'

import { tunnelError } from './params'

// Only a name the SSH host could not resolve falls back to Docker, so a working host or a refused port is never redirected. Covers glibc, musl and BSD getaddrinfo wording.
const UNRESOLVED = /resol|not known|no address/iu

const LOOKUP_TIMEOUT = 5000

// Single quotes and a pipe are the only shell syntax used, so a fish or csh login shell runs it too, and the host never enters the command.
const LIST_CONTAINERS = `docker ps -q | xargs docker inspect -f '{{.Name}} {{index .Config.Labels "com.docker.compose.service"}}{{range .NetworkSettings.Networks}} {{.IPAddress}}{{end}}'`

const lookups = new WeakMap<Client, Map<string, Promise<string | null>>>()

const lookUp = async (client: Client, host: string) => {
  const listed = await Result.tryPromise(async () => {
    const channel = await promisify(client.exec.bind(client))(LIST_CONTAINERS)
    const timer = setTimeout(() => {
      channel.emit('error', new Error('docker ps timed out'))
      channel.close()
    }, LOOKUP_TIMEOUT)
    try {
      return await Promise.all([text(channel), text(channel.stderr)])
    } finally {
      clearTimeout(timer)
    }
  })
  const [inspected, errors] = listed.unwrapOr(['', ''])
  if (/permission denied/iu.test(errors)) {
    throw tunnelError(
      `The SSH host can't resolve ${host}, and your SSH user can't run docker there to look for a container of that name. Add the user to the docker group.`
    )
  }
  const containers = inspected
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name = '', service = '', ...addresses] = line.split(' ')
      return { address: addresses.find(Boolean), name: name.slice(1), service }
    })
  const named = containers.find((container) => container.name === host)
  const ofService = containers.filter((container) => container.service === host)
  if (!named && ofService.length > 1) {
    throw tunnelError(
      `Several containers run the service ${host}: ${ofService.map((container) => container.name).join(', ')}. Use the container name as the host.`
    )
  }
  return (named ?? ofService[0])?.address ?? null
}

const getContainerAddress = async (client: Client, host: string) => {
  const pending =
    lookups.get(client) ?? new Map<string, Promise<string | null>>()
  lookups.set(client, pending)
  const address = pending.get(host) ?? lookUp(client, host)
  pending.set(host, address)
  try {
    return await address
  } finally {
    pending.delete(host)
  }
}

/** Forwards to the host as the SSH host resolves it; a name it can't resolve goes to the running container or Compose service of that name. */
export const forwardOut = async (
  client: Client,
  host: string,
  port: number
) => {
  const forward = (address: string) =>
    promisify(client.forwardOut.bind(client))('127.0.0.1', 0, address, port)
  try {
    return await forward(host)
  } catch (error) {
    if (!(error instanceof Error && UNRESOLVED.test(error.message))) {
      throw error
    }
    const address = await getContainerAddress(client, host)
    if (!address) {
      throw error
    }
    return forward(address)
  }
}
