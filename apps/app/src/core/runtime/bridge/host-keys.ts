import type { bridgeHostKey } from '@tamery/shared/bridge'
import { createStore } from 'seitu'

type BridgeHostKey = typeof bridgeHostKey.infer

interface HostKeyQuestion {
  answer: (trusted: boolean) => void
  answered: Promise<boolean>
  hostKey: BridgeHostKey
  id: string
}

const store = createStore<HostKeyQuestion[]>([])

export const bridgeHostKeys = {
  ask: (hostKey: BridgeHostKey) => {
    const id = `${hostKey.host} ${hostKey.fingerprint}`
    const asked = store.get().find((question) => question.id === id)
    if (asked) {
      return asked.answered
    }
    const { promise, resolve } = Promise.withResolvers<boolean>()
    const answered = promise.finally(() => {
      store.set((questions) =>
        questions.filter((question) => question.id !== id)
      )
    })
    store.set((questions) => [
      ...questions,
      { answer: resolve, answered, hostKey, id },
    ])
    return answered
  },
  store,
}
