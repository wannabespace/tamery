import type { AppUIMessage } from '@tamery/ai/message'
import type { FileUIPart } from 'ai'
import { Result } from 'better-result'

import { agentDatabase } from '~/core/agent/database'

import type { PromptMention } from '../mentions/prompt-mentions'

export const mentionPart = async (
  mention: PromptMention
): Promise<AppUIMessage['parts'][number]> => {
  if (mention.kind === 'connection') {
    return { data: mention.connection, type: 'data-connection' }
  }
  if (mention.kind === 'chat') {
    return { data: mention.chat, type: 'data-chat' }
  }
  if (mention.kind === 'skill') {
    const { description: _, ...skill } = mention.skill
    return { data: skill, type: 'data-skill' }
  }
  const definition = await Result.tryPromise(() =>
    agentDatabase.describeTable(mention.table)
  )
  return {
    data: { ...mention.table, definition: definition.unwrapOr(null) },
    type: 'data-table',
  }
}

/** A user turn's parts: its text, then its files, then what its mentions describe. */
export const messageParts = async (
  text: string,
  mentions: PromptMention[],
  files: FileUIPart[]
): Promise<AppUIMessage['parts']> => [
  ...(text ? [{ text, type: 'text' as const }] : []),
  ...files,
  ...(await Promise.all(mentions.map(mentionPart))),
]
