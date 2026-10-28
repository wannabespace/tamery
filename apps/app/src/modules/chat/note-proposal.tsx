import type { ChatTools } from '@tamery/ai/tools'
import { Button } from '@tamery/ui/components/button'
import { Textarea } from '@tamery/ui/components/textarea'
import { useState } from 'react'

import { resolveResource } from '~/core/agent/target'
import { schemaNotes } from '~/core/schema-notes/notes'
import { posthog } from '~/lib/posthog'

import type { ToolPartActions } from './chat-tool-part'

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
    <div className="bg-background ring-foreground/4 flex flex-col gap-2 rounded-xl p-2 ring">
      <Textarea
        data-mask
        aria-label="Note"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground mr-auto pl-1 text-xs">
          Every AI prompt about this database gets it once you save it
        </span>
        <Button
          size="sm"
          variant="ghost-muted"
          onClick={() => {
            posthog.capture('schema_note_dismissed')
            decideNote({ kept: null, toolCallId })
          }}
        >
          Dismiss
        </Button>
        <Button
          size="sm"
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
    </div>
  )
}
