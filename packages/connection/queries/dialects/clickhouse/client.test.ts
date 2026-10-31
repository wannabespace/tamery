import { expect, mock, spyOn, test } from 'bun:test'

import type { Destination } from '../../../forwarding'
import { forwarding } from '../../../forwarding'
import { tunnelSocket } from '../../../ssh/socket'
import { getClient } from './client'

test.each([
  ['http://u:p@ch.example.com/', 80],
  ['http://u:p@ch.example.com:8123/', 8123],
  ['https://u:p@ch.example.com/', 443],
])(
  'a forwarded socket for %p dials the port the client does',
  async (connectionString, port) => {
    const warning = spyOn(console, 'warn').mockImplementation(mock())
    const dialed: Destination[] = []
    const of = spyOn(forwarding, 'of').mockResolvedValue({
      socket: () => {
        throw new Error('dialed the form default port')
      },
      socketTo: (destination) => {
        dialed.push(destination)
        return tunnelSocket(Promise.reject(new Error('refused')))
      },
    })
    try {
      const client = await getClient(connectionString)
      await client.ping()
      await client.close()
      expect(dialed[0]).toMatchObject({ host: 'ch.example.com', port })
    } finally {
      of.mockRestore()
      warning.mockRestore()
    }
  }
)
