import type { InferClientOutputs } from '@orpc/client'
import type { BridgeRouter } from '@tamery/cli/src/bridge/router'
import { sleep } from '@tamery/shared/utils'
import { Result } from 'better-result'
import { createStore } from 'seitu'

type BridgeHostKey =
  InferClientOutputs<BridgeRouter>['bridge']['hostKeys'][number]

const POLL_MS = 1000

const store = createStore<BridgeHostKey[]>([])
// A list asked for before an answer reached the bridge still names that key.
const answered = new Set<string>()

let running = 0
let polling = false

const poll = async (list: () => Promise<BridgeHostKey[]>): Promise<void> => {
  await sleep(POLL_MS)
  if (running === 0) {
    polling = false
    store.set([])
    return
  }
  const waiting = await Result.tryPromise(() => list())
  store.set(waiting.unwrapOr([]).filter((key) => !answered.has(key.id)))
  return poll(list)
}

/** SSH host keys the bridge waits on a browser to trust. */
export const bridgeHostKeys = {
  forget: (id: string) => {
    answered.add(id)
    store.set((keys) => keys.filter((key) => key.id !== id))
  },
  store,
  /** The bridge holds a query while its tunnel waits for the answer, so the question is found only by asking alongside it. */
  watch: async <T>(
    run: () => Promise<T>,
    list: () => Promise<BridgeHostKey[]>
  ) => {
    running += 1
    if (!polling) {
      polling = true
      void poll(list)
    }
    try {
      return await run()
    } finally {
      running -= 1
    }
  },
}
