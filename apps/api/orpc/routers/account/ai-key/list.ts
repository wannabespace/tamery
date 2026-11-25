import { aiKey } from '~/lib/ai-key'
import { accountMiddleware, orpc } from '~/orpc'

const VISIBLE_CHARS = 4

/** Never the keys themselves: only their last characters, so the user can tell which key is saved. */
export const list = orpc.use(accountMiddleware).handler(async ({ context }) => {
  const saved = await aiKey.list(context.user.id)
  return saved.map(({ enabled, key, provider }) => ({
    enabled,
    end: key.slice(-VISIBLE_CHARS),
    provider,
  }))
})
