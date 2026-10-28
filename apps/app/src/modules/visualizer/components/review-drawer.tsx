import { coldDialect } from '@tamery/connection/queries/kysely'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import { isSqlDialect } from '@tamery/shared/enums/connection-type'
import { unsupported } from '@tamery/shared/unsupported'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@tamery/ui/components/alert'
import { CodeBlock } from '@tamery/ui/components/custom/code-block'

import { inlineParameters } from '~/core/codegen/formats/sql'
import type { DiagramDraft } from '~/core/drafts/diagram'
import { DiscardButton } from '~/core/drafts/discard-button'
import { ChangeGroup, StagedReviewDrawer } from '~/core/drafts/review-drawer'
import { formatSql } from '~/utils/formatter'
import { plural } from '~/utils/plural'

import { applyConsequence } from '../lib/apply'
import { draftStatement, inApplyOrder } from '../lib/statements'

const draftLabel = (draft: DiagramDraft) => {
  switch (draft.kind) {
    case 'createTable': {
      return `Create table with ${plural(draft.columns.length, 'column')}`
    }
    case 'renameTable': {
      return `Rename table to ${draft.newName}`
    }
    case 'dropTable': {
      return draft.cascade ? 'Drop table and its dependents' : 'Drop table'
    }
    case 'addColumn': {
      return `Add column ${draft.column.name} ${draft.column.type}`
    }
    case 'renameColumn': {
      return `Rename column ${draft.column} to ${draft.newName}`
    }
    case 'alterColumn': {
      return `Change ${draft.column} to ${draft.type}${draft.nullable ? '' : ' not null'}`
    }
    case 'dropColumn': {
      return `Drop column ${draft.column}`
    }
    case 'addForeignKey': {
      return `Link ${draft.columns.join(', ')} to ${draft.foreignTable}.${draft.foreignColumns.join(', ')}`
    }
    case 'dropForeignKey': {
      return `Drop foreign key ${draft.name}`
    }
    default: {
      return draft satisfies never
    }
  }
}

const previewSql = (dialect: Dialect, draft: DiagramDraft) => {
  if (!isSqlDialect(dialect)) {
    return unsupported('The visualizer')()
  }
  const { parameters, sql } = draftStatement(
    dialect,
    coldDialect(dialect),
    draft
  )
  return formatSql(
    parameters.length > 0 ? inlineParameters(sql, parameters, dialect) : sql,
    dialect
  )
}

export const ReviewDrawer = ({
  applying,
  dialect,
  ddlRollback,
  drafts,
  error,
  onApply,
  onDiscard,
  onDiscardAll,
  onOpenChange,
  onOpenChangeComplete,
  open,
}: {
  applying: boolean
  dialect: Dialect
  ddlRollback: boolean
  drafts: DiagramDraft[]
  error: Error | null
  onApply: () => void
  onDiscard: (id: string) => void
  onDiscardAll: () => void
  onOpenChange: (open: boolean) => void
  onOpenChangeComplete: (open: boolean) => void
  open: boolean
}) => {
  const groups = [
    ...Map.groupBy(
      inApplyOrder(drafts),
      (draft) => `${draft.schema}.${draft.table}`
    ),
  ]
  const consequence = applyConsequence(drafts, ddlRollback)

  return (
    <StagedReviewDrawer
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      busy={applying}
      count={drafts.length}
      description={`${plural(drafts.length, 'change')} · ${consequence.description}`}
      emptyDescription="Edit tables on the canvas and the changes will show up here."
      notice={
        error && (
          <Alert variant="destructive" className="mx-3 mb-3 w-auto">
            <AlertTitle>The database refused the changes</AlertTitle>
            <AlertDescription>
              <span data-mask className="font-mono select-text">
                {error.message}
              </span>
            </AlertDescription>
          </Alert>
        )
      }
      onDiscardAll={onDiscardAll}
      onSubmit={onApply}
      submit={{
        label: `Apply ${plural(drafts.length, 'change')}`,
        tooltip: `Apply ${plural(drafts.length, 'change')} to the database. ${consequence.description}`,
        variant: consequence.variant,
      }}
    >
      <div className="flex flex-col gap-3">
        {groups.map(([key, tableDrafts]) => (
          <ChangeGroup
            key={key}
            title={
              <span data-mask className="font-mono">
                {key}
              </span>
            }
          >
            {tableDrafts.map((draft) => (
              <div
                key={draft.id}
                className="border-foreground/6 flex flex-col gap-1.5 border-b py-2 pr-1.5 pl-3 last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <span data-mask className="min-w-0 flex-1 truncate text-xs">
                    {draftLabel(draft)}
                  </span>
                  <DiscardButton
                    label="Discard change"
                    onClick={() => onDiscard(draft.id)}
                    disabled={applying}
                  />
                </div>
                <CodeBlock
                  code={previewSql(dialect, draft)}
                  language="sql"
                  size="xs"
                  wrap
                  className="mr-1.5"
                />
              </div>
            ))}
          </ChangeGroup>
        ))}
      </div>
    </StagedReviewDrawer>
  )
}
