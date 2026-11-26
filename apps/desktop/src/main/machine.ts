import '@tamery/shared/arktype-config'
import { randomUUID } from 'node:crypto'
import process from 'node:process'

import { localAccount } from '@tamery/cli/src/local-account'
import type { Approver } from '@tamery/cli/src/machine/router'
import { runMachine } from '@tamery/cli/src/machine/run'
import type { VaultAccount } from '@tamery/cli/src/vault'
import { vault } from '@tamery/cli/src/vault'
import { hasErrnoCode } from '@tamery/shared/errno'
import { toError } from '@tamery/shared/utils'
import { Result } from 'better-result'

export type MachineAccount =
  | { kind: 'keep' }
  | { kind: 'switch'; account: VaultAccount }

export type MachineProcessRequest =
  | {
      type: 'start'
      account: MachineAccount
      /** The vault's key, which main keeps through `safeStorage` so the vault never asks the keychain itself. */
      key: string
      name: string
      port: number
      /** An `https://` origin main checked, as `tamery machine --public-url` requires. */
      publicUrl: string | null
    }
  | { type: 'answer'; id: string; allowed: boolean }

export type MachineProcessReply =
  | { type: 'started'; registerError: string | null; url: string }
  | { type: 'failed'; message: string }
  | { type: 'approval'; id: string; label: string; code: string }

const ANSWER_TIMEOUT_MS = 2 * 60 * 1000
const MAX_WAITING = 3

const reply = (message: MachineProcessReply) =>
  process.parentPort.postMessage(message)

const waiting = new Map<string, (allowed: boolean) => void>()

const approver: Approver = {
  ask: async (request) => {
    const id = randomUUID()
    const answer = Promise.withResolvers<boolean>()
    waiting.set(id, answer.resolve)
    const timeout = setTimeout(() => answer.resolve(false), ANSWER_TIMEOUT_MS)
    reply({ ...request, id, type: 'approval' })
    try {
      return await answer.promise
    } finally {
      clearTimeout(timeout)
      waiting.delete(id)
    }
  },
  isFull: () => waiting.size >= MAX_WAITING,
}

const start = async ({
  account,
  key,
  name,
  port,
  publicUrl,
}: Extract<MachineProcessRequest, { type: 'start' }>) => {
  vault.useKey(key)
  const saved = await Result.tryPromise(async () => {
    if (account.kind === 'switch') {
      await localAccount.set(account.account)
    }
    return vault.account()
  })
  if (saved.isErr()) {
    reply({ message: toError(saved.error.cause).message, type: 'failed' })
    return
  }
  const signedIn = saved.value
  if (!signedIn) {
    reply({
      message: 'Sign in again to let other devices use this computer.',
      type: 'failed',
    })
    return
  }
  const started = await Result.tryPromise(() =>
    runMachine({
      approver,
      name,
      port,
      publicUrl: publicUrl === null ? null : new URL(publicUrl),
      userId: signedIn.id,
    })
  )
  if (started.isErr()) {
    const { cause } = started.error
    reply({
      message: hasErrnoCode(cause, 'EADDRINUSE')
        ? `Port ${port} is busy. Quit whatever else uses it, then restart Tamery.`
        : toError(cause).message,
      type: 'failed',
    })
    return
  }
  const { registerError, url } = started.value
  reply({ registerError, type: 'started', url })
}

process.parentPort.on(
  'message',
  ({ data }: { data: MachineProcessRequest }) => {
    if (data.type === 'start') {
      void start(data)
    } else {
      waiting.get(data.id)?.(data.allowed)
    }
  }
)
