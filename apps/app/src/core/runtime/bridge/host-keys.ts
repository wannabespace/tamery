import type { bridgeHostKey } from '@tamery/shared/bridge'
import { createStore } from 'seitu'

type BridgeHostKey = typeof bridgeHostKey.infer

interface HostKeyQuestion {
  answer: (trusted: boolean) => void
  hostKey: BridgeHostKey
  id: string
}

const store = createStore<HostKeyQuestion[]>([])
const asking = new Map<string, Promise<boolean>>()

/** SSH host keys the bridge refused until this browser trusts them. Queries refused for one key share its question. */
export const bridgeHostKeys = {
  ask: (hostKey: BridgeHostKey) => {
    const id = `${hostKey.host} ${hostKey.fingerprint}`
    const pending = asking.get(id)
    if (pending) {
      return pending
    }
    const { promise, resolve } = Promise.withResolvers<boolean>()
    const question = { answer: resolve, hostKey, id }
    store.set((questions) => [...questions, question])
    const answered = promise.finally(() => {
      asking.delete(id)
      store.set((questions) => questions.filter((asked) => asked !== question))
    })
    asking.set(id, answered)
    return answered
  },
  store,
}
