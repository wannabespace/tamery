import type { IconSvgElement } from '@hugeicons/react'
import type * as React from 'react'
import { createContext } from 'react'

export type ColumnAlign = 'start' | 'center' | 'right'

export interface ResponseSlots {
  /** Turns an inline code span into a button led by `icon`, such as a table name the app can peek; `render` places that button, as a popover's trigger for one. Null keeps the plain span. */
  inlineCodeAction?: (text: string) => {
    icon: IconSvgElement
    render: (button: React.ReactElement) => React.ReactNode
  } | null
  /** Web links lead with their site's favicon, read at full ink, and show their address on hover; unset keeps plain links. */
  linkPreview?: boolean
  /** Draws a Markdown table from its header cells and body rows as plain text, with each column's alignment; unset keeps the HTML table. */
  table?: (table: {
    aligns: ColumnAlign[]
    columns: string[]
    rows: string[][]
  }) => React.ReactNode
}

// A context, not per-render `components`: Streamdown remounts every block whose component identity changes, so a streaming answer would lose collapsed states each chunk.
export const ResponseSlotsContext = createContext<ResponseSlots>({})
