import { NoteIcon, Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { matchesSearch } from '@tamery/shared/utils'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import { SearchInput } from '@tamery/ui/components/custom/search-input'
import { SettingsGroup } from '@tamery/ui/components/custom/settings-group'
import { ConnectionIcon } from '@tamery/ui/components/icons/connection-icon'
import { smallItemInsetClassName } from '@tamery/ui/components/item'
import { cn } from '@tamery/ui/lib/utils'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useHotkey } from '@tanstack/react-hotkeys'
import { useRef, useState } from 'react'

import { useCollections } from '~/core/collections'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { useShortcut } from '~/core/keyboard/use-shortcuts'
import { getNoteLabel } from '~/core/schema-notes/notes'
import type { SchemaNote } from '~/core/schema-notes/sync'

import { SchemaNoteDeleteDialog } from './schema-note-delete-dialog'
import { SchemaNoteRow } from './schema-note-row'

const SEARCH_FROM = 11

export const SchemaNotesSettings = () => {
  const {
    connectionsCollection,
    connectionsResourcesCollection,
    schemaNotesCollection,
  } = useCollections()
  const { data: rows, isReady } = useLiveQuery({
    query: (q) =>
      q
        .from({ note: schemaNotesCollection })
        .innerJoin(
          { resource: connectionsResourcesCollection },
          ({ note, resource }) => eq(note.connectionResourceId, resource.id)
        )
        .innerJoin(
          { connection: connectionsCollection },
          ({ connection, resource }) => eq(resource.connectionId, connection.id)
        )
        .select(({ connection, note, resource }) => ({
          connection,
          note,
          resource,
        }))
        .orderBy(({ connection }) => connection.name)
        .orderBy(({ resource }) => resource.name)
        .orderBy(({ note }) => note.table)
        .orderBy(({ note }) => note.column),
  })
  const [deleting, setDeleting] = useState<SchemaNote | null>(null)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const searchable = rows.length >= SEARCH_FROM

  useShortcut('search', () => searchRef.current?.focus(), {
    enabled: searchable,
  })
  useHotkey('Escape', () => setSearch(''), {
    enabled: !!search,
    target: searchRef,
  })

  if (!isReady) {
    return null
  }

  const groups = Map.groupBy(
    rows.filter(({ connection, note, resource }) =>
      matchesSearch(
        search,
        connection.name,
        resource.name,
        getNoteLabel(note),
        note.note
      )
    ),
    ({ resource }) => resource.id
  )

  return (
    <>
      <p
        className={cn(smallItemInsetClassName, 'text-muted-foreground text-sm')}
      >
        Facts a schema does not say, like a unit or what a code means. Tamery AI
        reads a database’s notes in every prompt about it and saves new ones as
        it learns them.
      </p>
      {searchable && (
        <SearchInput
          ref={searchRef}
          placeholder="Search notes"
          aria-label="Search notes"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch('')}
          start={<HugeiconsIcon icon={Search01Icon} strokeWidth={2} />}
          end={!search && <ShortcutKbd shortcut="search" />}
        />
      )}
      {rows.length > 0 && groups.size === 0 && (
        <IconEmpty
          icon={Search01Icon}
          title="No notes found"
          description="Search by table, column, database or what a note says."
        />
      )}
      {rows.length === 0 && (
        <IconEmpty
          icon={NoteIcon}
          title="No schema notes yet"
          description="Tamery AI saves one when it learns a fact about your data. Add your own to a table in the schema visualizer."
        />
      )}
      {[...groups].map(([resourceId, group]) => {
        const [first] = group
        return (
          first && (
            <SettingsGroup
              key={resourceId}
              title={
                <span className="flex items-center gap-1.5">
                  <ConnectionIcon
                    type={first.connection.type}
                    provider={first.connection.provider}
                    className="size-3.5"
                  />
                  <span data-mask>
                    {first.connection.name}
                    {first.resource.name && ` / ${first.resource.name}`}
                  </span>
                </span>
              }
            >
              {group.map(({ note }) => (
                <SchemaNoteRow
                  key={note.id}
                  note={note}
                  onDelete={setDeleting}
                />
              ))}
            </SettingsGroup>
          )
        )
      })}
      <SchemaNoteDeleteDialog
        note={deleting}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}
