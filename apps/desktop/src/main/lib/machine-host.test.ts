import { beforeEach, expect, mock, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as nextTick } from 'node:timers/promises'

import { configFiles } from '@tamery/cli/src/config-files'

import type { MachineProcessReply, MachineProcessRequest } from '../machine'

// oxlint-disable-next-line unicorn/prefer-event-target -- Electron's UtilityProcess is a Node EventEmitter.
class FakeWorker extends EventEmitter {
  requests: MachineProcessRequest[] = []

  postMessage(request: MachineProcessRequest) {
    this.requests.push(request)
  }

  reply(message: MachineProcessReply) {
    this.emit('message', message)
  }

  kill() {
    queueMicrotask(() => this.emit('exit'))
  }
}

let values: Record<string, unknown> = {}
let workers: FakeWorker[] = []
let forked = Promise.withResolvers<FakeWorker>()
const sent: { channel: string; window: number; status: unknown }[] = []
const userData = mkdtempSync(path.join(os.tmpdir(), 'machine-host-'))

mock.module('./private-store', () => ({
  createPrivateStore: ({
    defaults,
  }: {
    defaults: Record<string, unknown>
  }) => ({
    delete: (key: string) => {
      Reflect.deleteProperty(values, key)
    },
    get: (key: string) => (key in values ? values[key] : defaults[key]),
    set: (key: string | Record<string, unknown>, value?: unknown) => {
      values =
        typeof key === 'string'
          ? { ...values, [key]: value }
          : { ...values, ...key }
    },
  }),
}))
mock.module('electron', () => ({
  app: { getPath: () => userData },
  BrowserWindow: {
    getAllWindows: () =>
      [1, 2].map((window) => ({
        webContents: {
          send: (channel: string, status: unknown) =>
            sent.push({ channel, status, window }),
        },
      })),
  },
  dialog: {},
  safeStorage: {
    encryptStringAsync: (key: string) => Promise.resolve(Buffer.from(key)),
  },
  utilityProcess: {
    fork: () => {
      const worker = new FakeWorker()
      workers.push(worker)
      forked.resolve(worker)
      return worker
    },
  },
}))

const { machineHost } = await import('./machine-host')

const account = { email: 'a@example.com', id: 'user-a', token: 'token-a' }
const nextAccount = { email: 'b@example.com', id: 'user-b', token: 'token-b' }
const url = 'http://127.0.0.1:26382'

const lastSentTo = (window: number) =>
  sent.findLast((message) => message.window === window)

const startWorker = async () => {
  const turnedOn = machineHost.turnOn(account)
  return { turnedOn, worker: await forked.promise }
}

beforeEach(async () => {
  await machineHost.turnOff()
  values = {}
  workers = []
  forked = Promise.withResolvers<FakeWorker>()
  sent.length = 0
})

test('turn on reports a failure after the worker forked', async () => {
  const { turnedOn, worker } = await startWorker()
  worker.reply({ message: 'Port 26382 is busy.', type: 'failed' })

  expect(await turnedOn).toMatchObject({
    message: 'Port 26382 is busy.',
    status: 'failed',
  })
})

test('turn on settles once the worker listens, and turn off works while it registers', async () => {
  const { turnedOn, worker } = await startWorker()
  worker.reply({ type: 'listening', url })

  expect(await turnedOn).toMatchObject({ status: 'on', turnedOff: false })
  expect(lastSentTo(2)).toMatchObject({
    channel: 'machine.status',
    status: { status: 'on' },
  })

  await machineHost.turnOff()
  worker.reply({ registerError: null, type: 'started', url })
  await nextTick()

  expect(machineHost.status()).toMatchObject({
    status: 'off',
    turnedOff: true,
  })
  expect(lastSentTo(1)).toMatchObject({
    status: { status: 'off', turnedOff: true },
  })
})

test('the account that signed out is refused as soon as sign-out begins', async () => {
  const forgotten = machineHost.forget(account.token)
  const late = Promise.allSettled([
    machineHost.setPublicUrl({ account, publicUrl: 'https://old.example.com' }),
    machineHost.enable(account),
    machineHost.turnOn(account),
  ])
  await forgotten
  const results = await late

  expect(
    results.map((result) =>
      result.status === 'rejected' ? String(result.reason) : result.status
    )
  ).toEqual(
    Array.from({ length: 3 }, () => expect.stringContaining('signed out'))
  )
  await expect(
    machineHost.setPublicUrl({ account, publicUrl: 'https://old.example.com' })
  ).rejects.toThrow('signed out')
  expect(machineHost.status()).toMatchObject({ publicUrl: null })
  expect(workers).toHaveLength(0)

  await machineHost.setPublicUrl({
    account: nextAccount,
    publicUrl: 'https://new.example.com',
  })
  expect(machineHost.status()).toMatchObject({
    publicUrl: 'https://new.example.com',
  })
})

test('every window ends sign-out with no machine id, whatever the worker sends late', async () => {
  const idFile = path.join(
    userData,
    'machine',
    path.basename(configFiles.machineId)
  )
  const { turnedOn, worker } = await startWorker()
  mkdirSync(path.dirname(idFile), { recursive: true })
  writeFileSync(idFile, 'old-id')
  worker.reply({ type: 'listening', url })
  await turnedOn
  expect(lastSentTo(1)).toMatchObject({ status: { id: 'old-id' } })

  await machineHost.forget(account.token)
  worker.reply({ registerError: null, type: 'started', url })
  await nextTick()

  for (const window of [1, 2]) {
    expect(lastSentTo(window)).toMatchObject({
      status: { id: null, status: 'off' },
    })
  }
})

test('an address saved or cleared while off reaches every window', async () => {
  await machineHost.setPublicUrl({
    account,
    publicUrl: 'https://mac.example.com',
  })
  for (const window of [1, 2]) {
    expect(lastSentTo(window)).toMatchObject({
      status: { publicUrl: 'https://mac.example.com', status: 'off' },
    })
  }

  await machineHost.setPublicUrl({ account, publicUrl: null })
  for (const window of [1, 2]) {
    expect(lastSentTo(window)).toMatchObject({ status: { publicUrl: null } })
  }
  expect(workers).toHaveLength(0)
})

test('an address save from another account than the one the machine runs for is refused', async () => {
  await machineHost.turnOff()
  await machineHost.enable(account)

  await expect(
    machineHost.setPublicUrl({
      account: nextAccount,
      publicUrl: 'https://other.example.com',
    })
  ).rejects.toThrow('another account')
  expect(machineHost.status()).toMatchObject({ publicUrl: null })
})
