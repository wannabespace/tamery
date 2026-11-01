import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import process from 'node:process'

import { log } from '@clack/prompts'
import { sleep } from '@tamery/shared/utils'
import { type } from 'arktype'

import { configFiles } from '../config-files'
import { paint } from '../paint'
import { askInTerminal } from './terminal-question'

const requestsFile = type({
  requests: type({
    allowed: 'boolean | null',
    id: 'string',
    label: 'string',
  }).array(),
})

type AccessRequest = (typeof requestsFile.infer)['requests'][number]

/** Long enough to switch to the terminal; the browser holds its request open meanwhile. */
const ANSWER_TIMEOUT_MS = 2 * 60 * 1000
const POLL_MS = 500
/** More at once is a flood, not someone clicking Connect. */
const MAX_WAITING = 3

/** A file, so `tamery bridge approve` in another terminal answers the bridge without a port or a secret of its own. */
const read = (): AccessRequest[] =>
  fs.existsSync(configFiles.requests)
    ? requestsFile.assert(
        JSON.parse(fs.readFileSync(configFiles.requests, 'utf-8'))
      ).requests
    : []

const update = (change: (requests: AccessRequest[]) => AccessRequest[]) =>
  configFiles.write(
    configFiles.requests,
    JSON.stringify({ requests: change(read()) })
  )

const decide = (id: string, allowed: boolean) =>
  update((requests) =>
    requests.map((request) =>
      request.id === id ? { ...request, allowed } : request
    )
  )

const askHere = async (request: AccessRequest, signal: AbortSignal) => {
  const allowed = await askInTerminal(
    `Allow ${paint.bold(request.label)} to run queries on this computer?`,
    { signal }
  )
  if (allowed !== null) {
    decide(request.id, allowed)
  }
}

export const approvals = {
  /** `true` once allowed here or with `tamery bridge approve`; `false` when declined, unanswered or flooded. */
  ask: async (label: string) => {
    if (approvals.waiting().length >= MAX_WAITING) {
      return false
    }
    const request: AccessRequest = { allowed: null, id: randomUUID(), label }
    update((requests) => [...requests, request])
    const answered = new AbortController()
    if (process.stdin.isTTY) {
      void askHere(request, answered.signal)
    } else {
      log.info(
        `${paint.bold(label)} asks to run queries here. Run ${paint.accent('tamery bridge approve')} to answer.`
      )
    }
    try {
      const deadline = Date.now() + ANSWER_TIMEOUT_MS
      while (Date.now() < deadline) {
        const allowed = read().find(({ id }) => id === request.id)?.allowed
        if (typeof allowed === 'boolean') {
          return allowed
        }
        // oxlint-disable-next-line eslint/no-await-in-loop -- polling the file another process answers in
        await sleep(POLL_MS)
      }
      return false
    } finally {
      answered.abort()
      update((requests) => requests.filter(({ id }) => id !== request.id))
    }
  },
  /** A bridge that stopped mid-request leaves its requests behind; a new one starts clean. */
  clear: () => configFiles.remove(configFiles.requests),
  decide,
  waiting: () => read().filter(({ allowed }) => allowed === null),
}
