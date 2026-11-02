import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { log } from '@clack/prompts'
import { sleep } from '@tamery/shared/utils'
import { type } from 'arktype'
import { Result } from 'better-result'

import { configFiles } from '../config-files'
import { paint } from '../paint'
import { askInTerminal } from './terminal-question'

const requestFile = type({ question: 'string' })

const ANSWER_TIMEOUT_MS = 2 * 60 * 1000
const POLL_MS = 500
const MAX_WAITING = 3
const ALLOWED = 'allowed'

const getFiles = (id: string) => ({
  answer: path.join(configFiles.requests, `${id}.answer`),
  request: path.join(configFiles.requests, `${id}.json`),
})

const readAnswer = (id: string) =>
  Result.try(() => fs.readFileSync(getFiles(id).answer, 'utf-8'))
    .map((answer) => answer === ALLOWED)
    .unwrapOr(null)

/** The first answer stands: the bridge's terminal and `tamery bridge approve` can both be asking. */
const decide = (id: string, allowed: boolean) => {
  configFiles.create(getFiles(id).answer, allowed ? ALLOWED : 'declined')
}

const waiting = () =>
  configFiles
    .readAll(configFiles.requests)
    .filter(({ id }) => !fs.existsSync(getFiles(id).answer))
    .map(({ data, id }) => ({
      id,
      ...requestFile.assert(JSON.parse(data)),
    }))

const askHere = async (id: string, question: string, signal: AbortSignal) => {
  const allowed = await askInTerminal(question, { signal })
  if (allowed !== null) {
    decide(id, allowed)
  }
}

export const approvals = {
  ask: async (question: string) => {
    if (approvals.isFull()) {
      return false
    }
    const id = randomUUID()
    const files = getFiles(id)
    configFiles.write(files.request, JSON.stringify({ question }))
    const answered = new AbortController()
    if (process.stdin.isTTY) {
      void askHere(id, question, answered.signal)
    } else {
      log.info(
        `${question} Run ${paint.accent('tamery bridge approve')} to answer.`
      )
    }
    try {
      const deadline = Date.now() + ANSWER_TIMEOUT_MS
      while (Date.now() < deadline) {
        const allowed = readAnswer(id)
        if (allowed !== null) {
          return allowed
        }
        // oxlint-disable-next-line eslint/no-await-in-loop -- polling the file another process answers in
        await sleep(POLL_MS)
      }
      return false
    } finally {
      answered.abort()
      configFiles.remove(files.request)
      configFiles.remove(files.answer)
    }
  },
  clear: () => configFiles.remove(configFiles.requests),
  decide,
  isFull: () => waiting().length >= MAX_WAITING,
  waiting,
}
