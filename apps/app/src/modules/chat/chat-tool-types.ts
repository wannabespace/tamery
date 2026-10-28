import type { AppUIMessage } from '@tamery/ai/message'
import type { ToolUIPart } from 'ai'

import type { ChatSession } from './use-chat-session'

export type ChatToolPart = Extract<AppUIMessage['parts'][number], ToolUIPart>

export interface ToolPartActions {
  /** Set only while a pending change or note may still be decided: on the last turn, with nothing streaming. */
  decide?: ChatSession['decide']
  /** On the last turn a pending call is still running; on an earlier one it never ran. */
  isLast: boolean
}
