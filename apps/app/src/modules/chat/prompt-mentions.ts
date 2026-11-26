import type { ChatDataParts } from '@tamery/ai/tools'
import { matchesSearch } from '@tamery/shared/utils'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { useSubscription } from 'seitu/react'

import { useCollections } from '~/core/collections'
import { lastOpenedResourcesStorageValue } from '~/core/connection/last-opened-resources'
import { useConnectionContext } from '~/core/connection/route'
import { useLocalMachine } from '~/core/local-machine'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { useConnectionRunsOn } from '~/core/runtime/machine/pairing'
import { posthog } from '~/lib/posthog'

import { escapeRegExp } from './mention-text'
import type { ChatCommand } from './slash-commands'
import { COMMANDS } from './slash-commands'
import { chatTab } from './tab'

export type PromptMention =
  | {
      chat: ChatDataParts['chat']
      kind: 'chat'
      label: string
    }
  | {
      connection: ChatDataParts['connection']
      kind: 'connection'
      label: string
    }
  | {
      kind: 'skill'
      label: string
      skill: ChatDataParts['skill'] & { description: string | null }
    }
  | {
      kind: 'table'
      label: string
      table: Omit<ChatDataParts['table'], 'definition'>
    }

export type PromptSuggestion =
  | { command: ChatCommand; id: string; kind: 'command'; label: string }
  | {
      /** A connection row standing for its most recent resource whose others ArrowRight lists. */
      expandable?: boolean
      id: string
      /** A row of an expanded connection, named by its resource. */
      isResource?: boolean
      /** A table's schema, unless it is the connection's default one. */
      schema?: string
      kind: PromptMention['kind']
      mention: PromptMention
    }

interface ResourceRow {
  connectionId: string
  id: string
  name: string
  resource: string | null
  type: ChatDataParts['connection']['type']
}

interface Trigger {
  char: '@' | '/'
  query: string
  start: number
}

const MAX_SUGGESTIONS = 30
/** Chats come last and only once the query names one, so they never crowd out connections and tables. */
const MAX_CHAT_SUGGESTIONS = 3

const skillCommand = (name: string) => `skill:${name}`

const suggestionName = (suggestion: PromptSuggestion) => {
  if (suggestion.kind === 'command') {
    return suggestion.command
  }
  const { mention } = suggestion
  if (mention.kind === 'skill') {
    return skillCommand(mention.skill.name)
  }
  if (mention.kind === 'chat') {
    return mention.chat.title
  }
  return mention.kind === 'table'
    ? mention.table.table
    : mention.connection.name
}

/** Lower first: a name starting with the query, then one containing it, then a match only in a description or resource. */
const matchRank = (query: string, suggestion: PromptSuggestion) => {
  const name = suggestionName(suggestion).toLowerCase()
  const needle = query.trim().toLowerCase()
  if (name.startsWith(needle)) {
    return 0
  }
  return name.includes(needle) ? 1 : 2
}

const byMatch = (query: string, suggestions: PromptSuggestion[]) =>
  suggestions.toSorted((a, b) => matchRank(query, a) - matchRank(query, b))

const resourceSuggestion = (
  item: ResourceRow,
  siblings: number
): Extract<PromptSuggestion, { mention: PromptMention }> => ({
  id: `connection:${item.id}`,
  kind: 'connection',
  mention: {
    connection: {
      connectionId: item.connectionId,
      name: item.name,
      resource: item.resource,
      type: item.type,
    },
    kind: 'connection',
    // The resource tells two mentions of one connection apart.
    label:
      siblings > 1 && item.resource
        ? `@${item.name}/${item.resource}`
        : `@${item.name}`,
  },
})

/** The label stands as a word of its own, so `@users` never matches inside `a@users.com` or `@users_v2`. */
const mentionedIn = (text: string, label: string) =>
  new RegExp(`(?:^|\\s)${escapeRegExp(label)}(?=$|[\\s.,;:!?)])`, 'u').test(
    text
  )

const triggerAt = (text: string, caret: number): Trigger | null => {
  const before = text.slice(0, caret)
  const match = /(?:^|\s)(?<char>[@/])(?<query>[^\s@/]*)$/u.exec(before)
  const char = match?.groups?.char
  const query = match?.groups?.query ?? ''
  if (char !== '@' && char !== '/') {
    return null
  }
  if (char === '/' && before.trimStart() !== `/${query}`) {
    return null
  }
  return { char, query, start: caret - query.length - 1 }
}

/** A chat's title has spaces, so its query runs on past them while some title still holds it; the space after a whole title ends it, so a picked chat never reopens the menu. */
const chatTriggerAt = (
  text: string,
  caret: number,
  titles: string[]
): Trigger | null => {
  const query = /(?:^|\s)@(?<query>[^@\n]*)$/u.exec(text.slice(0, caret))
    ?.groups?.query
  return query &&
    titles.some((title) => title.toLowerCase().includes(query.toLowerCase()))
    ? { char: '@', query, start: caret - query.length - 1 }
    : null
}

/** `@` mentions a connection or a table of this one, `/` at the start writes a command for Enter to run. The textarea keeps focus; the arrows and Enter drive the menu through `onKeyDown` while it is open. */
export const usePromptMentions = ({
  commands = true,
  setValue,
  textareaRef,
  value,
}: {
  /** False where a command means nothing, such as an edited message: `/` then lists only skills. */
  commands?: boolean
  setValue: (value: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
}) => {
  const { connection, connectionResource } = useConnectionContext()
  const {
    chatsCollection,
    connectionsCollection,
    connectionsResourcesCollection,
  } = useCollections()
  const { data: chats } = useLiveQuery({
    query: (q) =>
      q
        .from({ chats: chatsCollection })
        .where(({ chats: chat }) =>
          eq(chat.connectionResourceId, connectionResource.id)
        )
        .orderBy(({ chats: chat }) => chat.updatedAt, 'desc'),
  })
  const { tabId } = useParams({ strict: false })
  const currentChatId =
    tabId && chatTab.match(tabId, connectionResource.id)?.chatId
  const { data: resources } = useLiveQuery({
    query: (q) =>
      q
        .from({ resources: connectionsResourcesCollection })
        .innerJoin(
          { connections: connectionsCollection },
          ({ resources: resource, connections }) =>
            eq(resource.connectionId, connections.id)
        )
        .where(({ connections }) =>
          eq(connections.workspaceId, connection.workspaceId)
        )
        .select(({ resources: resource, connections }) => ({
          connectionId: connections.id,
          id: resource.id,
          name: connections.name,
          resource: resource.name,
          type: connections.type,
        })),
  })
  const machine = useLocalMachine(useConnectionRunsOn(connection.id))
  const { data: skills = [] } = useQuery({
    enabled: !!machine,
    queryFn: () => machine?.listSkills() ?? [],
    queryKey: [...(machine?.queryKey ?? []), 'skills'],
    staleTime: 30_000,
  })
  const { data: catalog } = useQuery(
    resourceTablesAndSchemasQueryOptions({ connectionResource })
  )
  const [caret, setCaret] = useState(0)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState('')
  const [mentions, setMentions] = useState<PromptMention[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const lastOpened = useSubscription(lastOpenedResourcesStorageValue)

  const tableMention = (schema: string, table: string): PromptMention => ({
    kind: 'table',
    label: `@${table}`,
    table: {
      connectionId: connection.id,
      resource: connectionResource.name,
      schema,
      table,
    },
  })

  const chatMentions = chats.flatMap((chat) =>
    chat.title && !chat.parentChatId && chat.id !== currentChatId
      ? [
          {
            chat: { chatId: chat.id, title: chat.title },
            kind: 'chat' as const,
            label: `@${chat.title}`,
          },
        ]
      : []
  )
  const trigger =
    dismissed === value
      ? null
      : (chatTriggerAt(
          value,
          caret,
          chatMentions.map(({ chat }) => chat.title)
        ) ?? triggerAt(value, caret))
  const query = trigger?.query ?? ''
  const recency = (item: ResourceRow) => {
    const index = lastOpened.indexOf(item.id)
    return index === -1 ? Number.POSITIVE_INFINITY : index
  }
  const byConnection = Object.values(
    Object.groupBy(
      resources
        .filter((item) => item.id !== connectionResource.id)
        .toSorted((a, b) => recency(a) - recency(b)),
      (item) => item.connectionId
    )
  ).flatMap((group) => (group ? [group] : []))
  /** Every connection and table the text could mention, so a mention typed by hand or restored with a draft counts like a picked one. */
  const known = (): PromptMention[] => [
    ...byConnection.flatMap((group) =>
      group.map((item) => resourceSuggestion(item, group.length).mention)
    ),
    ...(catalog?.schemas ?? []).flatMap((schema) =>
      schema.tables.map((table) => tableMention(schema.name, table.name))
    ),
    ...chatMentions,
  ]
  const expanded =
    trigger?.char === '@'
      ? byConnection.find((group) => group[0]?.connectionId === expandedId)
      : undefined

  const listed = (): PromptSuggestion[] => {
    if (expanded) {
      return expanded.map((item) => ({
        ...resourceSuggestion(item, expanded.length),
        isResource: true,
      }))
    }
    if (trigger?.char === '/') {
      return byMatch(query, [
        ...COMMANDS.filter(
          ([command, label]) => commands && matchesSearch(query, command, label)
        ).map(([command, label]): PromptSuggestion => ({
          command,
          id: `command:${command}`,
          kind: 'command',
          label,
        })),
        ...skills
          .filter((skill) =>
            matchesSearch(
              query,
              skillCommand(skill.name),
              skill.description ?? ''
            )
          )
          .map((skill): PromptSuggestion => ({
            id: `skill:${skill.path}`,
            kind: 'skill',
            mention: {
              kind: 'skill',
              label: `/${skillCommand(skill.name)}`,
              skill: {
                description: skill.description,
                instructions: skill.instructions,
                name: skill.name,
                source: skill.source,
              },
            },
          })),
      ])
    }
    const named = byMatch(query, [
      ...byConnection.flatMap((group): PromptSuggestion[] => {
        const latest = group.find((item) =>
          matchesSearch(query, item.name, item.resource)
        )
        return latest
          ? [
              {
                ...resourceSuggestion(latest, group.length),
                expandable: group.length > 1,
              },
            ]
          : []
      }),
      ...(catalog?.schemas ?? []).flatMap((schema) =>
        schema.tables
          .filter((table) => matchesSearch(query, table.name))
          .map((table): PromptSuggestion => ({
            id: `table:${schema.name}.${table.name}`,
            kind: 'table',
            schema:
              schema.name === catalog?.defaultSchema ? undefined : schema.name,
            mention: tableMention(schema.name, table.name),
          }))
      ),
    ]).slice(0, MAX_SUGGESTIONS)
    if (!query) {
      return named
    }
    return [
      ...named,
      ...byMatch(
        query,
        chatMentions
          .filter((mention) => matchesSearch(query, mention.chat.title))
          .map((mention) => ({
            id: `chat:${mention.chat.chatId}`,
            kind: 'chat' as const,
            mention,
          }))
      ).slice(0, MAX_CHAT_SUGGESTIONS),
    ]
  }
  const suggestions = listed()

  const isOpen = !!trigger && suggestions.length > 0
  const active =
    suggestions.find(({ id }) => id === highlighted) ?? suggestions[0]

  const pick = (suggestion: PromptSuggestion) => {
    if (!trigger) {
      return
    }
    const label =
      suggestion.kind === 'command'
        ? `/${suggestion.command}`
        : suggestion.mention.label
    if (suggestion.kind !== 'command') {
      setExpandedId(null)
      posthog.capture('ai_chat_mention', { kind: suggestion.mention.kind })
      setMentions((current) => [...current, suggestion.mention])
    }
    const next = `${value.slice(0, trigger.start)}${label} ${value.slice(caret)}`
    const nextCaret = trigger.start + label.length + 1
    setValue(next)
    setCaret(nextCaret)
    requestAnimationFrame(() =>
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret)
    )
  }

  const move = (delta: number) => {
    const index = active ? suggestions.indexOf(active) : 0
    const next =
      suggestions[(index + delta + suggestions.length) % suggestions.length]
    if (next) {
      setHighlighted(next.id)
    }
  }

  const expand = (suggestion: PromptSuggestion) => {
    if (
      suggestion.kind === 'connection' &&
      suggestion.mention.kind === 'connection'
    ) {
      setExpandedId(suggestion.mention.connection.connectionId)
      setHighlighted(suggestion.id)
    }
  }

  const collapse = () => {
    setExpandedId(null)
    const row = expanded?.[0]
    if (row) {
      setHighlighted(`connection:${row.id}`)
    }
  }

  return {
    expand,
    /** The connection whose resources the menu lists instead of its own rows. */
    expanded: expanded?.[0]?.name ?? null,
    highlighted: active?.id ?? '',
    isOpen,
    /** Returns whether the menu consumed the key. */
    onKeyDown: (event: React.KeyboardEvent) => {
      if (!isOpen || event.nativeEvent.isComposing) {
        return false
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        move(event.key === 'ArrowDown' ? 1 : -1)
      } else if (
        event.key === 'ArrowRight' &&
        active?.kind !== 'command' &&
        active?.expandable
      ) {
        expand(active)
      } else if (
        (event.key === 'ArrowLeft' || event.key === 'Escape') &&
        expanded
      ) {
        collapse()
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        if (active) {
          pick(active)
        }
      } else if (event.key === 'Escape') {
        setDismissed(value)
      } else {
        return false
      }
      event.preventDefault()
      event.stopPropagation()
      return true
    },
    onSelect: (event: React.SyntheticEvent<HTMLTextAreaElement>) =>
      setCaret(event.currentTarget.selectionStart),
    pick,
    reset: () => setMentions([]),
    sentMentions: () => {
      const all = [...mentions, ...known()]
      return all.filter(
        (mention, index) =>
          mentionedIn(value, mention.label) &&
          all.findIndex(({ label }) => label === mention.label) === index
      )
    },
    setHighlighted,
    suggestions,
  }
}
