import { expect, spyOn, test } from 'bun:test'

import { drainBackground, runInBackground } from './background'

test('background work that fails is logged, never its error', async () => {
  const log = spyOn(console, 'error').mockImplementation(() => {})
  const failure = Promise.reject(new TypeError('secret row'))

  runInBackground(failure).catch(() => null)
  await drainBackground()
  await Bun.sleep(0)

  expect(log).toHaveBeenCalledWith('background work failed', {
    type: 'TypeError',
  })
  log.mockRestore()
})
