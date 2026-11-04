import type { OffsetNode, SchemableIdentifierNode } from 'kysely'
import { IdentifierNode, ValueNode } from 'kysely'

import { ClickhouseQueryCompiler } from '../clickhouse/query-compiler'

/** What PostHog's catalog reports as a table's schema: only a label, HogQL resolves no table under it. */
export const POSTHOG_SCHEMA_LABELS = new Set(['public', 'views', 'warehouse'])

export class PosthogQueryCompiler extends ClickhouseQueryCompiler {
  protected override visitSchemableIdentifier(node: SchemableIdentifierNode) {
    const parts = node.schema?.name.split('.') ?? []
    if (!POSTHOG_SCHEMA_LABELS.has(parts[0] ?? '')) {
      for (const part of parts) {
        this.visitNode(IdentifierNode.create(part))
        this.append('.')
      }
    }
    this.visitNode(node.identifier)
  }

  // PostHog answers 400 to any OFFSET from a personal API key, `OFFSET 0` included.
  protected override visitOffset(node: OffsetNode) {
    if (!(ValueNode.is(node.offset) && node.offset.value === 0)) {
      super.visitOffset(node)
    }
  }
}
