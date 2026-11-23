import '@tamery/shared/arktype-config'
import process from 'node:process'

import { approvals } from '@tamery/cli/src/machine/approvals'
import { runMachine } from '@tamery/cli/src/machine/run'
import { vault } from '@tamery/cli/src/vault'
import { hasErrnoCode } from '@tamery/shared/errno'
import { toError } from '@tamery/shared/utils'
import { Result } from 'better-result'

/** `null` keeps the account this computer's machine already signed in with. */
export interface MachineAccount {
  email: string
  id: string
  token: string
}

export type MachineProcessRequest =
  | {
      type: 'start'
      account: MachineAccount | null
      /** The vault's key, which main keeps through `safeStorage` so the vault never asks the keychain itself. */
      key: string
      name: string
      port: number
      /** An `https://` origin main checked, as `tamery machine --public-url` requires. */
      publicUrl: string | null
    }
  | { type: 'answer'; id: string; allowed: boolean }

export type MachineProcessReply =
  | { type: 'started'; id: string; registerError: string | null; url: string }
  | { type: 'failed'; message: string }
  | { type: 'approval'; id: string; question: string }

/** As often as `tamery machine approve` looks: the process has no terminal, so a request waits for an answer file. */
const APPROVALS_POLL_MS = 500

const reply = (message: MachineProcessReply) =>
  process.parentPort.postMessage(message)

const relayApprovals = () => {
  const asked = new Set<string>()
  setInterval(() => {
    for (const request of approvals.waiting()) {
      if (!asked.has(request.id)) {
        asked.add(request.id)
        reply({ id: request.id, question: request.question, type: 'approval' })
      }
    }
  }, APPROVALS_POLL_MS)
}

const start = async ({
  account,
  key,
  name,
  port,
  publicUrl,
}: Extract<MachineProcessRequest, { type: 'start' }>) => {
  vault.useKey(key)
  if (account) {
    await vault.setAccount(account)
  }
  const signedIn = await vault.account()
  if (!signedIn) {
    reply({
      message: 'Sign in again to let other devices use this computer.',
      type: 'failed',
    })
    return
  }
  const started = await Result.tryPromise(() =>
    runMachine({
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
        ? `Port ${port} is busy. Quit whatever else uses it, then turn this on again.`
        : toError(cause).message,
      type: 'failed',
    })
    return
  }
  const { id, registerError, url } = started.value
  reply({ id, registerError, type: 'started', url })
  relayApprovals()
}

process.parentPort.on(
  'message',
  ({ data }: { data: MachineProcessRequest }) => {
    if (data.type === 'start') {
      void start(data)
    } else {
      approvals.decide(data.id, data.allowed)
    }
  }
)
