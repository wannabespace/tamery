import process from 'node:process'

import { note, spinner } from '@clack/prompts'
import { challenge } from '@tamery/shared/challenge'
import { Result } from 'better-result'

import { analytics } from './analytics'
import { account, api } from './api'
import { pairings } from './bridge/pairings'
import { openBrowser } from './browser'
import { env } from './env'
import { paint } from './paint'
import { vault } from './vault'

const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000

const signIn = async () => {
  const verifier = challenge.generateVerifier()
  const codeChallenge = challenge.generateCode(verifier)
  const url = `${env.MAIN_URL}/deep/sign-in?codeChallenge=${codeChallenge}&type=cli`

  const cancel = new AbortController()
  process.once('SIGINT', () => cancel.abort())
  const signal = AbortSignal.any([
    cancel.signal,
    AbortSignal.timeout(SIGN_IN_TIMEOUT_MS),
  ])

  // The confirm page refuses a challenge no device listens for, so the browser opens only once this one does.
  const events = await api.account.challenge.listen(
    { codeChallenge },
    { signal }
  )
  await events.next()

  void openBrowser(url)
  note(
    `${paint.link(url)}\n${paint.dim('The link expires in 5 minutes.')}`,
    'Sign in to Tamery'
  )

  const waiting = spinner({ signal })
  waiting.start('Waiting for you to sign in')
  try {
    for await (const event of events) {
      if (event.ready) {
        break
      }
    }
    const { token } = await api.account.challenge.exchange(
      { codeChallenge, verifier },
      { signal }
    )
    const user = await account.getUser(token)
    if (!user) {
      throw new Error('Tamery did not accept the new session. Try again.')
    }
    waiting.message(
      'Saving the session. If your system keychain asks, allow it'
    )
    const signedIn = { email: user.email, id: user.id, token }
    const previous = await vault.account()
    if (previous && previous.id !== user.id) {
      await vault.reset()
      pairings.reset()
    }
    await vault.setAccount(signedIn)
    await analytics.capture('signed_in', {})
    waiting.stop(`Signed in as ${paint.bold(user.email)}`)
    return signedIn
  } catch (error) {
    waiting.error(
      signal.aborted ? 'Sign in cancelled or timed out' : 'Sign in failed'
    )
    throw error
  }
}

/**
 * The saved account, unless Tamery answered that its session is over; with Tamery unreachable it still stands. Without
 * `canSignIn`, a missing one fails at once instead of waiting minutes for a browser nobody is watching.
 */
export const getAccount = async (canSignIn = true) => {
  const saved = await vault.account()
  const user =
    saved && (await Result.tryPromise(() => account.getUser(saved.token)))
  if (saved && !(user?.isOk() && user.value === null)) {
    return saved
  }
  if (!canSignIn) {
    throw new Error(`Not signed in. Run ${paint.accent('tamery login')}.`)
  }
  return signIn()
}
