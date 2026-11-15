import type { ChatTools } from '@tamery/ai/tools'
import { Button } from '@tamery/ui/components/button'
import { insetCardVariants } from '@tamery/ui/components/card.utils'
import { Textarea } from '@tamery/ui/components/textarea'
import { cn } from '@tamery/ui/lib/utils'
import { useState } from 'react'

import { resolveResource } from '~/core/agent/target'
import { schemaNotes } from '~/core/schema-notes/notes'
import { posthog } from '~/lib/posthog'

import type { ToolPartActions } from './chat-tool-types'

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
    <div className={cn(insetCardVariants(), 'flex flex-col gap-2')}>
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
