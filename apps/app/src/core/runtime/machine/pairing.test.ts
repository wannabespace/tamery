import { afterEach, beforeEach, expect, mock, test } from 'bun:test'

import { machineIdSchema } from '@tamery/shared/machine'

import type { ConnectionMachine } from './sync'

const OWN_ID = 'own'
const OTHER_ID = machineIdSchema.assert('other')
let rows: ConnectionMachine[] = []
const capture = mock((_event: string, _properties: object) => null)

const connectionMachinesCollection = {
  delete: (id: string) => {
    rows = rows.filter((row) => row.id !== id)
  },
  insert: (row: ConnectionMachine) => {
    rows = [...rows, row]
  },
  get toArray() {
    return rows
  },
  update: (id: string, change: (draft: ConnectionMachine) => void) => {
    rows = rows.map((row) => {
      const draft = { ...row }
      if (row.id === id) {
        change(draft)
      }
      return draft
    })
  },
}

mock.module('~/core/collections', () => ({
  getCollections: () => ({ connectionMachinesCollection }),
  mutateOffline: (mutate: () => void) => mutate(),
  useCollections: () => ({ connectionMachinesCollection }),
}))
mock.module('~/lib/posthog', () => ({ posthog: { capture } }))
mock.module('~/lib/query-client', () => ({
  queryClient: {
    getQueryData: () => (window.electron ? { id: OWN_ID } : undefined),
  },
}))
Object.assign(globalThis, { window: {} })

const { CLOUD, THIS_COMPUTER, getConnectionRunsOn, writeRunsOn } =
  await import('./pairing')

const PLATFORMS = { desktop: true, web: false }

const on = (platform: keyof typeof PLATFORMS) => {
  if (PLATFORMS[platform]) {
    Object.assign(window, { electron: {} })
  }
}

const NO_ROW = undefined

const storeRow = (machineId: string | null | typeof NO_ROW) => {
  const now = new Date()
  rows =
    machineId === NO_ROW
      ? []
      : [
          {
            connectionId: 'c',
            createdAt: now,
            id: 'row',
            machineId,
            updatedAt: now,
          },
        ]
}

beforeEach(() => {
  rows = []
  capture.mockClear()
})

afterEach(() => {
  Reflect.deleteProperty(window, 'electron')
})

test.each([
  ['web', NO_ROW, CLOUD],
  ['web', null, CLOUD],
  ['web', OTHER_ID, OTHER_ID],
  ['desktop', NO_ROW, THIS_COMPUTER],
  ['desktop', null, CLOUD],
  ['desktop', OWN_ID, THIS_COMPUTER],
  ['desktop', OTHER_ID, OTHER_ID],
] as const)('on %s a stored %p reads as %p', (platform, machineId, runsOn) => {
  on(platform)
  storeRow(machineId)
  expect(getConnectionRunsOn('c')).toBe(runsOn)
})

const ON_MACHINE = { on_cloud: false, on_machine: true }
const ON_CLOUD_ROW = { on_cloud: true, on_machine: false }
const NO_ROW_LEFT = { on_cloud: false, on_machine: false }

test.each([
  ['web', NO_ROW, OTHER_ID, OTHER_ID, ON_MACHINE],
  ['web', 'previous', OTHER_ID, OTHER_ID, ON_MACHINE],
  ['web', 'previous', CLOUD, NO_ROW, NO_ROW_LEFT],
  ['desktop', NO_ROW, OTHER_ID, OTHER_ID, ON_MACHINE],
  ['desktop', NO_ROW, CLOUD, null, ON_CLOUD_ROW],
  ['desktop', 'previous', CLOUD, null, ON_CLOUD_ROW],
  ['desktop', null, THIS_COMPUTER, NO_ROW, NO_ROW_LEFT],
] as const)(
  'on %s over a stored %p, picking %p stores %p and reads back',
  (platform, previous, runsOn, machineId, properties) => {
    on(platform)
    storeRow(previous)
    writeRunsOn('c', runsOn)
    expect(rows.map((row) => row.machineId)).toEqual(
      machineId === NO_ROW ? [] : [machineId]
    )
    expect(getConnectionRunsOn('c')).toBe(runsOn)
    expect(capture).toHaveBeenCalledWith('connection_machine_set', properties)
  }
)

test.each([
  ['web', null, CLOUD],
  ['desktop', OWN_ID, THIS_COMPUTER],
] as const)(
  'on %s saving the default keeps the other platform’s stored %p',
  (platform, machineId, runsOn) => {
    on(platform)
    storeRow(machineId)
    writeRunsOn('c', runsOn)
    expect(rows.map((row) => row.machineId)).toEqual([machineId])
    expect(capture).not.toHaveBeenCalled()
  }
)
