import process from 'node:process'

import { note, spinner } from '@clack/prompts'
import { challenge } from '@tamery/shared/challenge'

import { account, api } from './api'
import { openBrowser } from './browser'
import { env } from './env'
import { paint } from './paint'
import { vault } from './vault'

const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000

/** The website confirms the sign-in and hands this computer its own session through the challenge flow. */
export const signIn = async () => {
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

  openBrowser(url)
  note(
    `${paint.link(url)}\n${paint.dim(`Continue only if the page shows ${paint.bold(challenge.getUserCode(codeChallenge))}. The link expires in 5 minutes.`)}`,
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
    const signedIn = { email: user.email, id: user.id, token }
    await vault.setAccount(signedIn)
    waiting.stop(`Signed in as ${paint.bold(user.email)}`)
    return signedIn
  } catch (error) {
    waiting.error(
      signal.aborted ? 'Sign in cancelled or timed out' : 'Sign in failed'
    )
    throw error
  }
}
