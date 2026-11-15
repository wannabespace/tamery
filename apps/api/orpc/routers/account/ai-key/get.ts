import { aiKey } from '~/lib/ai-key'
import { accountMiddleware, orpc } from '~/orpc'

const VISIBLE_CHARS = 4

/** Never the key itself: its provider and last characters, so the user can tell which key is saved. */
export const get = orpc.use(accountMiddleware).handler(async ({ context }) => {
  const saved = await aiKey.get(context.user.id)
  return (
    saved && { end: saved.key.slice(-VISIBLE_CHARS), provider: saved.provider }
  )
})
