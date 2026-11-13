import type { ChatDataParts } from '@tamery/ai/tools'
import { matchesSearch } from '@tamery/shared/utils'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSubscription } from 'seitu/react'

import { useCollections } from '~/core/collections'
import { lastOpenedResourcesStorageValue } from '~/core/connection/last-opened-resources'
import { useConnectionContext } from '~/core/connection/route'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { posthog } from '~/lib/posthog'

export type PromptMention =
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

/** In the order the menu lists them. */
export const COMMANDS = [
  ['new', 'Start a new chat'],
  ['model', 'Choose the model'],
  ['retry', 'Ask the last message again'],
  ['copy', 'Copy the last answer'],
  ['auto', 'Additive changes run on their own'],
  ['ask', 'Every change waits for Run'],
] as const

export type ChatCommand = (typeof COMMANDS)[number][0]

export type PromptSuggestion =
  | { command: ChatCommand; id: string; kind: 'command'; label: string }
  | {
      /** A connection row standing for its most recent resource whose others ArrowRight lists. */
      expandable?: boolean
      id: string
      /** A row of an expanded connection, named by its resource. */
      isResource?: boolean
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

const suggestionName = (suggestion: PromptSuggestion) => {
  if (suggestion.kind === 'command') {
    return suggestion.command
  }
  const { mention } = suggestion
  if (mention.kind === 'skill') {
    return mention.skill.name
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

/** `@` mentions a connection or a table of this one, `/` at the start runs a command. The textarea keeps focus; the arrows and Enter drive the menu through `onKeyDown` while it is open. */
export const usePromptMentions = ({
  onCommand,
  setValue,
  textareaRef,
  value,
}: {
  onCommand: (command: ChatCommand) => void
  setValue: (value: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
}) => {
  const { connection, connectionResource } = useConnectionContext()
  const { connectionsCollection, connectionsResourcesCollection } =
    useCollections()
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
  const { data: skills = [] } = useQuery({
    enabled: !!window.electron,
    queryFn: async () => (await window.electron?.localSkills.list()) ?? [],
    queryKey: ['local-skills'],
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

  const trigger = dismissed === value ? null : triggerAt(value, caret)
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
        ...COMMANDS.filter(([command, label]) =>
          matchesSearch(query, command, label)
        ).map(([command, label]): PromptSuggestion => ({
          command,
          id: `command:${command}`,
          kind: 'command',
          label,
        })),
        ...skills
          .filter((skill) =>
            matchesSearch(query, skill.name, skill.description ?? '')
          )
          .map((skill): PromptSuggestion => ({
            id: `skill:${skill.path}`,
            kind: 'skill',
            mention: {
              kind: 'skill',
              label: `/${skill.name}`,
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
    return byMatch(query, [
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
            mention: {
              kind: 'table',
              label: `@${table.name}`,
              table: {
                connectionId: connection.id,
                resource: connectionResource.name,
                schema: schema.name,
                table: table.name,
              },
            },
          }))
      ),
    ]).slice(0, MAX_SUGGESTIONS)
  }
  const suggestions = listed()

  const isOpen = !!trigger && suggestions.length > 0
  const active =
    suggestions.find(({ id }) => id === highlighted) ?? suggestions[0]

  const pick = (suggestion: PromptSuggestion) => {
    if (!trigger) {
      return
    }
    if (suggestion.kind === 'command') {
      setValue('')
      onCommand(suggestion.command)
      return
    }
    setExpandedId(null)
    posthog.capture('ai_chat_mention', { kind: suggestion.mention.kind })
    const { label } = suggestion.mention
    const next = `${value.slice(0, trigger.start)}${label} ${value.slice(caret)}`
    const nextCaret = trigger.start + label.length + 1
    setMentions((current) => [...current, suggestion.mention])
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
    const connectionId = expanded?.[0]?.connectionId
    setExpandedId(null)
    const row = byConnection
      .find((group) => group[0]?.connectionId === connectionId)
      ?.at(0)
    if (row) {
      setHighlighted(`connection:${row.id}`)
    }
  }

  return {
    active,
    collapse,
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
      } else if (event.key === 'ArrowLeft' && expanded) {
        collapse()
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        if (active) {
          pick(active)
        }
      } else if (event.key === 'Escape' && expanded) {
        collapse()
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
    sentMentions: () =>
      mentions.filter(
        (mention, index) =>
          value.includes(mention.label) &&
          mentions.findIndex(({ label }) => label === mention.label) === index
      ),
    setHighlighted,
    suggestions,
  }
}
