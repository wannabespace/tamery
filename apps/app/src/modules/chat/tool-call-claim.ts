import { v7 } from 'uuid'

import { orpc } from '~/lib/orpc'

const WINDOW_ID = v7()

/** The server gives each tool call to one window, so two windows or devices never answer or run it twice. A claim the API cannot answer lets this window go on alone. */
export const claimToolCall = (chatId: string, toolCallId: string) =>
  orpc.ai.claimToolCall
    .call(
      { chatId, toolCallId, windowId: WINDOW_ID },
      { context: { silent: true } }
    )
    .catch(() => true)
