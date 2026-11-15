import type { AppMessagePart, AppUIMessage } from '@tamery/ai/message'
import type { ToolUIPart } from 'ai'

import type { ChatSession } from './use-chat-session'

export type ChatToolPart = Extract<AppUIMessage['parts'][number], ToolUIPart>

export interface ToolPartActions {
  /** Set only while a pending change may still be decided: on the last turn, with nothing streaming. */
  decide?: ChatSession['decide']
  /** On the last turn a pending call is still running; on an earlier one it never ran. */
  isLast: boolean
}

// Only a change waits for the user; a read is still `input-available` while the window runs it.
export const awaitsUser = (part: AppMessagePart) =>
  part.type === 'tool-execute' && part.state === 'input-available'
