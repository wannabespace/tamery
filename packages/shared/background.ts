import { silently } from './utils'

const pending = new Set<Promise<unknown>>()

const track = async (work: Promise<unknown>) => {
  pending.add(work)
  await silently(() => work)
  pending.delete(work)
}

export const runInBackground = <T>(work: Promise<T>) => {
  void track(work)
  return work
}

export const drainBackground = () => Promise.allSettled(pending)
