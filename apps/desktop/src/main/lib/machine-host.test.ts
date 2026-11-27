import { beforeEach, expect, mock, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as nextTick } from 'node:timers/promises'

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
const started = {
  registerError: null,
  type: 'started',
  url: 'http://127.0.0.1:26382',
} as const

const lastSentTo = (window: number) =>
  sent.findLast((message) => message.window === window)

const startWorker = async () => {
  const turnedOn = machineHost.turnOn({ account, session: 0 })
  return { turnedOn, worker: await forked.promise }
}

beforeEach(async () => {
  await machineHost.turnOff()
  values = {}
  workers = []
  forked = Promise.withResolvers<FakeWorker>()
  sent.length = 0
})

test('turn on waits for the worker and reports a failure after it forked', async () => {
  const { turnedOn, worker } = await startWorker()
  worker.reply({ message: 'Port 26382 is busy.', type: 'failed' })

  expect(await turnedOn).toMatchObject({
    message: 'Port 26382 is busy.',
    status: 'failed',
  })
})

test('every window hears the machine turn on and off', async () => {
  const { turnedOn, worker } = await startWorker()
  worker.reply(started)

  expect(await turnedOn).toMatchObject({ status: 'on', turnedOff: false })
  await nextTick()
  expect(lastSentTo(1)).toMatchObject({
    channel: 'machine.status',
    status: { status: 'on' },
  })
  expect(lastSentTo(2)).toMatchObject({ status: { status: 'on' } })

  await machineHost.turnOff()
  await nextTick()
  expect(lastSentTo(2)).toMatchObject({
    status: { status: 'off', turnedOff: true },
  })
})

test('a request sent before sign-out is refused and keeps nothing', async () => {
  const { session } = await machineHost.status()
  await machineHost.forget()

  await expect(
    machineHost.setPublicUrl({ publicUrl: 'https://old.example.com', session })
  ).rejects.toThrow('signed out')
  await expect(machineHost.enable({ account, session })).rejects.toThrow(
    'signed out'
  )
  expect(await machineHost.status()).toMatchObject({
    publicUrl: null,
    status: 'off',
  })
  expect(workers).toHaveLength(0)
})
