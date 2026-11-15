import type { DefinitionsSection } from '~/core/catalog/sections'

/** Escapes only the id's own separator, and `%` so the name decodes back; the router encodes the rest. */
const escapeIdPart = (part: string) =>
  part.replaceAll('%', '%25').replaceAll(':', '%3A')

/** A tab's URL for code outside the router; its `:` separators stay readable, as the router's own links write them. */
export const tabPath = (resourceId: string, tabId: string) =>
  `/connection/${resourceId}/${encodeURIComponent(tabId).replaceAll('%3A', ':')}`

export const tableTabId = (schema: string, table: string) =>
  `table:${escapeIdPart(schema)}:${escapeIdPart(table)}`

export const parseTableTabId = (id: string) => {
  const [kind, schema, table, ...extra] = id.split(':')

  return kind === 'table' && schema && table && extra.length === 0
    ? { schema: decodeURIComponent(schema), table: decodeURIComponent(table) }
    : null
}

export const definitionsTabId = (section: DefinitionsSection) =>
  `definitions:${section}`
