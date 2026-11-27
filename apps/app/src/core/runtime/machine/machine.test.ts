import { beforeEach, expect, mock, test } from 'bun:test'

const account = { email: 'a@example.com', id: 'user-a', token: 'token-a' }
const turnOn = mock((_input: object) =>
  Promise.resolve<object>({ status: 'on' })
)

mock.module('~/core/collections', () => ({ getCollections: () => ({}) }))
mock.module('~/lib/auth', () => ({
  bearerToken: { get: () => account.token },
  getSessionUser: () => Promise.resolve({ ...account, isAnonymous: false }),
}))
mock.module('~/lib/orpc', () => ({ orpc: {} }))
mock.module('~/lib/posthog', () => ({ posthog: { capture: () => null } }))
mock.module('~/lib/query-client', () => ({ queryClient: {} }))
mock.module('./pairing', () => ({
  clearMachinePairing: () => null,
  getMachineRoute: () => null,
  getThisMachineId: () => null,
  machineAsks: {},
  machinePairings: {},
  thisMachineQuery: {},
}))
mock.module('./status', () => ({
  ensureConnected: () => Promise.resolve(null),
  forget: () => null,
  statusQueryOptions: () => ({}),
  toStatus: () => null,
}))

Object.assign(globalThis, { window: { electron: { machine: { turnOn } } } })

const { machine } = await import('./machine')

beforeEach(() => {
  turnOn.mockClear()
})

test('turn on sends the signed-in account', async () => {
  await machine.turnThisComputerOn()

  expect(turnOn).toHaveBeenCalledWith({
    email: account.email,
    id: account.id,
    token: account.token,
  })
})

test('turn on succeeds quietly when the user turned it off while it started', async () => {
  turnOn.mockResolvedValueOnce({ status: 'off', turnedOff: true })

  await expect(machine.turnThisComputerOn()).resolves.toBeUndefined()
})

test('turn on fails when the worker failed after it forked', async () => {
  turnOn.mockResolvedValueOnce({ message: 'Port is busy.', status: 'failed' })

  await expect(machine.turnThisComputerOn()).rejects.toThrow('Port is busy.')
})

test('turn on fails when the worker stopped before it listened', async () => {
  turnOn.mockResolvedValueOnce({ status: 'off' })

  await expect(machine.turnThisComputerOn()).rejects.toThrow('stopped')
})
