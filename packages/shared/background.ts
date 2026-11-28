const pending = new Set<Promise<unknown>>()

const settle = async (work: Promise<unknown>) => {
  try {
    await work
  } catch (error) {
    // Never the error itself: a provider's error can carry chat text and database content.
    console.error('background work failed', {
      type: error instanceof Error ? error.name : typeof error,
    })
  } finally {
    pending.delete(work)
  }
}

export const runInBackground = <T>(work: Promise<T>) => {
  pending.add(work)
  void settle(work)
  return work
}

export const drainBackground = () => Promise.allSettled(pending)
