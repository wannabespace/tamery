import { randomUUID } from 'node:crypto'

import { log } from '@clack/prompts'
import type { ConfirmHostKey } from '@tamery/connection/ssh/host-key'

import { paint } from '../paint'
import { printable } from './printable'

const ANSWER_TIMEOUT_MS = 2 * 60 * 1000

type HostKeyQuestion = Parameters<ConfirmHostKey>[0]

const waiting = new Map<
  string,
  { question: HostKeyQuestion; trust: (trusted: boolean) => void }
>()

/** In memory, unlike `approvals`: a paired browser answers, through this process, while the query that asked waits. */
export const hostKeys = {
  answer: (id: string, trusted: boolean) => waiting.get(id)?.trust(trusted),
  ask: (question: HostKeyQuestion) => {
    const id = randomUUID()
    const { promise, resolve } = Promise.withResolvers<boolean>()
    const timeout = setTimeout(resolve, ANSWER_TIMEOUT_MS, false)
    waiting.set(id, { question, trust: resolve })
    log.info(
      `Asked the browser whether to trust the SSH host ${paint.bold(printable(question.host))}.`
    )
    return promise.finally(() => {
      clearTimeout(timeout)
      waiting.delete(id)
    })
  },
  waiting: () =>
    [...waiting].map(([id, { question }]) => ({ id, ...question })),
}
