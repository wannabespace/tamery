import { confirm, isCancel } from '@clack/prompts'

let queue: Promise<unknown> = Promise.resolve()

/**
 * One yes/no on screen at a time, since two prompts would fight over the terminal. `null` when withdrawn through `signal`
 * before or while it is shown, or dismissed with Ctrl+C.
 */
export const askInTerminal = (
  message: string,
  {
    initialValue = true,
    signal,
  }: { initialValue?: boolean; signal?: AbortSignal }
) => {
  const asked = queue.then(async () => {
    if (signal?.aborted) {
      return null
    }
    const answer = await confirm({ initialValue, message, signal })
    return isCancel(answer) ? null : answer
  })
  queue = asked
  return asked
}
