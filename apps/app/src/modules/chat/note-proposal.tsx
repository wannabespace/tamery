import { NoteIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ChatTools } from '@tamery/ai/tools'
import { Button } from '@tamery/ui/components/button'
import { InlineCode } from '@tamery/ui/components/custom/inline-code'
import { Textarea } from '@tamery/ui/components/textarea'
import { useState } from 'react'

import { resolveResource } from '~/core/agent/target'
import { schemaNotes } from '~/core/schema-notes/notes'
import { posthog } from '~/lib/posthog'

import type { ToolPartActions } from './chat-tool-types'
import { ToolCard, ToolCardHeader } from './tool-card'

/** What a note is about: a column, a table or the whole database. */
export const NoteTitle = ({
  input,
  prefix = 'Schema note',
}: {
  input: Partial<ChatTools['propose_note']['input']> | undefined
  prefix?: string
}) => {
  const target =
    input?.table &&
    (input.column ? `${input.table}.${input.column}` : input.table)
  return target ? (
    <>
      {prefix} on <InlineCode data-mask>{target}</InlineCode>
    </>
  ) : (
    `${prefix} on this database`
  )
}

export const NoteProposal = ({
  decideNote,
  input,
  toolCallId,
}: {
  decideNote: NonNullable<ToolPartActions['decide']>['note']
  input: ChatTools['propose_note']['input']
  toolCallId: string
}) => {
  const [text, setText] = useState(input.note)
  const kept = text.trim()

  return (
    <ToolCard>
      <ToolCardHeader
        icon={<HugeiconsIcon icon={NoteIcon} strokeWidth={2} />}
        title={<NoteTitle input={input} />}
        status={<span className="text-warning">Needs review</span>}
      />
      <div className="p-2">
        <Textarea
          data-mask
          aria-label="Note"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <div className="flex items-center gap-1.5 p-2">
        <span className="text-muted-foreground mr-auto pl-1 text-xs">
          Saved to this database’s schema notes, which Tamery AI reads in every
          chat
        </span>
        <Button
          size="xs"
          variant="ghost-muted"
          onClick={() => {
            posthog.capture('schema_note_dismissed')
            decideNote({ kept: null, toolCallId })
          }}
        >
          Dismiss
        </Button>
        <Button
          size="xs"
          disabled={!kept}
          onClick={() => {
            const { resource } = resolveResource(input)
            schemaNotes.add(
              {
                column: input.column,
                connectionResourceId: resource.id,
                note: kept,
                schema: input.schema,
                table: input.table,
              },
              'agent'
            )
            decideNote({ kept, toolCallId })
          }}
        >
          Save
        </Button>
      </div>
    </ToolCard>
  )
}
