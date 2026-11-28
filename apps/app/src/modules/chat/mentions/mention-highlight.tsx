import type * as React from 'react'

import { splitMentions } from './mention-text'

/** Draws a chip behind each mention of a textarea's text; it sits under the textarea, which it must match in padding and type, and follows its scroll through `ref`. */
export const MentionHighlight = ({
  labels,
  ref,
  value,
}: {
  labels: string[]
  ref?: React.Ref<HTMLDivElement>
  value: string
}) => (
  <div
    ref={ref}
    aria-hidden
    className="pointer-events-none absolute inset-0 overflow-hidden border border-transparent px-3 pt-2.5 pb-2 text-base wrap-break-word whitespace-pre-wrap text-transparent md:text-sm"
  >
    {splitMentions(value, labels).map((part, index) =>
      part.isMention ? (
        <mark
          key={index}
          className="bg-muted ring-muted rounded-sm text-transparent ring-2"
        >
          {part.text}
        </mark>
      ) : (
        part.text
      )
    )}
  </div>
)
