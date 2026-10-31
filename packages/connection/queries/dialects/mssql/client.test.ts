import { expect, spyOn, test } from 'bun:test'
import { duplexPair } from 'node:stream'

import type { Destination } from '../../../forwarding'
import { forwarding } from '../../../forwarding'
import { tunnelSocket } from '../../../ssh/socket'
import { poolConfig } from './client'

test('the connector dials the address tedious names, not the seed', async () => {
  const dialed: Destination[] = []
  const of = spyOn(forwarding, 'of').mockResolvedValue({
    socket: () => {
      throw new Error('dialed the seed')
    },
    socketTo: (destination) => {
      dialed.push(destination)
      return tunnelSocket(Promise.resolve(duplexPair()[0]))
    },
  })
  try {
    const { options } = await poolConfig('sqlserver://u:p@seed.example.com/db')
    const connect:
      | ((destination: Destination) => Promise<{ destroy: () => unknown }>)
      | undefined = options?.connector
    const redirect = { host: 'redirected.example.com', port: 11_000 }
    const socket = await connect?.(redirect)
    socket?.destroy()
    expect(dialed).toEqual([redirect])
  } finally {
    of.mockRestore()
  }
})
