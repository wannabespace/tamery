import { memoize } from 'memoza'
import { createStore } from 'seitu'

import { posthog } from '~/lib/posthog'

export type SubagentStatus = 'done' | 'failed' | 'running' | 'waiting'

export interface Subagent {
  chatId: string
  parentChatId: string
  status: SubagentStatus
  title: string
  /** The parent's `spawn_agent` call this subagent answers. */
  toolCallId: string
}

/** Subagents started in this window; finished ones of earlier sessions come from their parent's transcript instead. */
export const subagentsStore = createStore<Subagent[]>([])

export const PARENT_CHAT = null

/** The subagent the chat tab shows instead of its parent, per resource. */
export const openSubagentStore = memoize((_resourceId: string) =>
  createStore<string | typeof PARENT_CHAT>(PARENT_CHAT)
)

export const setSubagentStatus = (chatId: string, status: SubagentStatus) =>
  subagentsStore.set((all) =>
    all.map((agent) => (agent.chatId === chatId ? { ...agent, status } : agent))
  )

/** A subagent's chat is working again once the user decides a change it asked about. */
export const resumeSubagent = (chatId: string) => {
  if (subagentsStore.get().some((agent) => agent.chatId === chatId)) {
    setSubagentStatus(chatId, 'running')
  }
}

export const openSubagent = (
  resourceId: string,
  chatId: string | typeof PARENT_CHAT
) => {
  openSubagentStore(resourceId).set(chatId)
  if (chatId !== PARENT_CHAT) {
    posthog.capture('ai_chat_subagent_opened')
  }
}
