import type { DialectSpec } from '../dialect'
import { clickhouse } from './clickhouse'

export const posthog: DialectSpec = {
  ...clickhouse,
  dollarNames: true,
  fieldPaths: true,
  // `system` is where HogQL keeps its tables, and read as a keyword it stops `system.` completing them.
  keywords: clickhouse.keywords.difference(new Set(['SYSTEM'])),
  readOnly: true,
}
