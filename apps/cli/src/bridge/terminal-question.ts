import process from 'node:process'

import { confirm, isCancel, log } from '@clack/prompts'

import { paint } from '../paint'

let queue: Promise<unknown> = Promise.resolve()

// clack closes a prompt its own `signal` aborts without drawing it again, leaving the question on screen as if open;
// Ctrl+C closes it the way the user would. Not Escape: clack also reads it as a cursor key, which flips a yes/no.
const dismissPrompt = () => {
  process.stdin.emit('keypress', '\u0003', {
    ctrl: true,
    name: 'c',
    sequence: '\u0003',
  })
  log.message(
    paint.dim(
      'Closed here: answered in another terminal, or nobody answered in time.'
    )
  )
}

/**
 * One yes/no on screen at a time, since two prompts would fight over the terminal. `null` when withdrawn through `signal`
 * before or while it is shown, or dismissed with Ctrl+C. No is preselected: Enter must never grant access to a request
 * the user did not read.
 */
export const askInTerminal = (message: string, signal?: AbortSignal) => {
  const asked = queue.then(async () => {
    if (signal?.aborted) {
      return null
    }
    signal?.addEventListener('abort', dismissPrompt, { once: true })
    const answer = await confirm({ initialValue: false, message })
    signal?.removeEventListener('abort', dismissPrompt)
    return isCancel(answer) ? null : answer
  })
  queue = asked
  return asked
}
