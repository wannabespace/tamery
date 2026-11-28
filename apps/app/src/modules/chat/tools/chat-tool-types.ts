import type { AppMessagePart, AppUIMessage } from '@tamery/ai/message'
import type { ToolUIPart } from 'ai'
import { isToolUIPart } from 'ai'

import type { ChatSession } from '../session/use-chat-session'

export type ChatToolPart = Extract<AppUIMessage['parts'][number], ToolUIPart>

export interface ToolPartActions {
  /** Set only while a pending change may still be decided: on the last turn, with nothing streaming. */
  decide?: ChatSession['decide']
  /** While its turn still works a pending call is running; once the turn ended or was stopped, it never ran. */
  isLive: boolean
  /** Changes Auto skipped: those the user ran since, and running one; unset where the chat cannot take a message. */
  skipped?: {
    ran: ReadonlySet<string>
    run: ChatSession['runSkipped']
  }
}

const USER_ANSWERED = new Set(['tool-ask_user', 'tool-execute'])

// Only a change or a question waits for the user; a read is still `input-available` while the window runs it.
export const awaitsUser = (part: AppMessagePart) =>
  isToolUIPart(part) &&
  USER_ANSWERED.has(part.type) &&
  part.state === 'input-available'
