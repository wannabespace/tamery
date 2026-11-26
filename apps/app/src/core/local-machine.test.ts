import { expect, mock, test } from 'bun:test'

import { LOCAL_SKILLS_PROTOCOL, machineIdSchema } from '@tamery/shared/machine'

const MACHINE_ID = machineIdSchema.assert('machine')

let protocol = LOCAL_SKILLS_PROTOCOL
const list = mock(() => Promise.resolve([]))

mock.module('~/core/runtime/machine/machine', () => ({
  machine: { client: () => ({ localSkills: { list } }) },
}))
mock.module('~/core/runtime/machine/pairing', () => ({
  MACHINE_QUERY_KEY: 'machine',
  machinePairings: {},
  THIS_COMPUTER: 'this-computer',
  useMachineRouteById: () => ({
    name: 'Laptop',
    pairing: { browserId: 'browser' },
  }),
  useMachines: () => [],
}))
mock.module('~/core/runtime/machine/status', () => ({
  ensureConnected: () => Promise.resolve({ protocol }),
}))

const { useLocalMachine } = await import('./local-machine')

test('a machine older than skills is outdated and is never asked for them', async () => {
  protocol = LOCAL_SKILLS_PROTOCOL - 1
  list.mockClear()
  expect(await useLocalMachine(MACHINE_ID)?.listSkills()).toEqual({
    state: 'outdated',
  })
  expect(list).not.toHaveBeenCalled()
})

test('a machine that serves skills lists them', async () => {
  protocol = LOCAL_SKILLS_PROTOCOL
  expect(await useLocalMachine(MACHINE_ID)?.listSkills()).toEqual({
    skills: [],
    state: 'listed',
  })
})
