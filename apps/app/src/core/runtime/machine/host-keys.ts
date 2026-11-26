import type { MachineId, machineHostKey } from '@tamery/shared/machine'
import { createStore } from 'seitu'

type MachineHostKey = typeof machineHostKey.infer

interface HostKeyQuestion {
  answer: (trusted: boolean) => void
  answered: Promise<boolean>
  hostKey: MachineHostKey
  id: string
}

const store = createStore<HostKeyQuestion[]>([])

export const machineHostKeys = {
  /** Per machine: each trusts the key in its own known_hosts, so one answer never covers another computer. */
  ask: (machineId: MachineId, hostKey: MachineHostKey) => {
    const id = `${machineId} ${hostKey.host} ${hostKey.fingerprint}`
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
