import { confirm, isCancel } from '@clack/prompts'

let queue: Promise<unknown> = Promise.resolve()

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
    const answer = await confirm({ initialValue: false, message, signal })
    return isCancel(answer) ? null : answer
  })
  queue = asked
  return asked
}
