import type { ChatDataParts } from '@tamery/ai/tools'
import { matchesSearch } from '@tamery/shared/utils'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { useCollections } from '~/core/collections'
import { useConnectionContext } from '~/core/connection/route'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'

export type PromptMention =
  | {
      connection: ChatDataParts['connection']
      kind: 'connection'
      label: string
    }
  | {
      kind: 'table'
      label: string
      table: Omit<ChatDataParts['table'], 'definition'>
    }

export type PromptSuggestion =
  | { command: 'new'; id: string; kind: 'command'; label: string }
  | { id: string; kind: PromptMention['kind']; mention: PromptMention }

interface Trigger {
  char: '@' | '/'
  query: string
  start: number
}

const MAX_SUGGESTIONS = 30

const COMMANDS = [{ command: 'new', label: 'New chat' }] as const

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
  onCommand: (command: 'new') => void
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
  const { data: catalog } = useQuery(
    resourceTablesAndSchemasQueryOptions({ connectionResource })
  )
  const [caret, setCaret] = useState(0)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState('')
  const [mentions, setMentions] = useState<PromptMention[]>([])

  const trigger = dismissed === value ? null : triggerAt(value, caret)
  const query = trigger?.query ?? ''

  const suggestions: PromptSuggestion[] =
    trigger?.char === '/'
      ? COMMANDS.filter(({ label }) => matchesSearch(query, label)).map(
          ({ command, label }) => ({
            command,
            id: `command:${command}`,
            kind: 'command',
            label,
          })
        )
      : [
          ...resources
            .filter(
              (item) =>
                item.id !== connectionResource.id &&
                matchesSearch(query, item.name, item.resource)
            )
            .map((item): PromptSuggestion => ({
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
                label: `@${item.name}`,
              },
            })),
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
        ].slice(0, MAX_SUGGESTIONS)

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

  return {
    active,
    highlighted: active?.id ?? '',
    isOpen,
    /** Returns whether the menu consumed the key. */
    onKeyDown: (event: React.KeyboardEvent) => {
      if (!isOpen || event.nativeEvent.isComposing) {
        return false
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        move(event.key === 'ArrowDown' ? 1 : -1)
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
