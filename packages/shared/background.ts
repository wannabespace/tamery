import { silently } from './utils'

const pending = new Set<Promise<unknown>>()

export const runInBackground = <T>(work: Promise<T>) => {
  pending.add(work)
  void silently(() => work).finally(() => pending.delete(work))
  return work
}

export const drainBackground = () => Promise.allSettled(pending)
