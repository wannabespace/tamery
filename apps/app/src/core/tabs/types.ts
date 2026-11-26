import type { IconSvgElement } from '@hugeicons/react'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import { type } from 'arktype'
import type { ReactNode } from 'react'

import type { Connection, ConnectionResource } from '~/core/connection/sync'

export const connectionTabType = type({
  id: 'string',
  'preview?': 'boolean',
  'title?': 'string',
})

export type ConnectionTab = typeof connectionTabType.infer

// Methods, not properties: method parameters are bivariant, so a kind or view
// typed with its own params still fits `TabKind[]` / `TabView`.
/* oxlint-disable typescript/method-signature-style */
export interface TabKind<Params = unknown> {
  available?(params: Params, dialect: Dialect): boolean
  fullTitle?(params: Params): string
  icon(params: Params): IconSvgElement
  label?(params: Params, siblings: Params[]): string
  match(id: string): Params | null
  onActivate?(resourceId: string, params: Params): void
  onClose?(resourceId: string, id: string): void
  onRename?(resourceId: string, from: Params, to: Params): void
  /** Renames what the tab shows rather than the tab itself, such as a chat; false leaves it to the tab's own name. */
  renameTitle?(params: Params, title: string): boolean
  title(params: Params): string
  type: string
}

export interface TabContext {
  connection: Connection
  connectionResource: ConnectionResource
}

export interface TabView<Params = unknown> {
  Content(props: { id: string; params: Params }): ReactNode
  load?(context: TabContext & { params: Params; search: TabSearch }): void
  prefetch?(connectionResource: ConnectionResource, params: Params): void
  Refresh?(props: { params: Params }): ReactNode
}
/* oxlint-enable typescript/method-signature-style */

export const tabSearchType = type({
  'create?': 'string',
  'open?': 'string',
  'schema?': 'string',
})

type TabSearch = typeof tabSearchType.infer

export interface SchemaItem {
  available?: (dialect: Dialect) => boolean
  icon: IconSvgElement
  label: string
  tabId: string
}
