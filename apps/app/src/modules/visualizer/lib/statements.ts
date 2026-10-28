import type { Dialect } from '@tamery/shared/enums/connection-type'
import type { CompiledQuery, Kysely } from 'kysely'

import type { DiagramDraft } from '~/core/drafts/diagram'
import {
  addConstraint,
  dropConstraintStatement,
} from '~/core/queries/constraints/shape'
import {
  addColumnStatement,
  createTableStatement,
  dropColumnStatement,
  dropTableStatement,
  renameColumnStatement,
  renameTableStatement,
} from '~/core/queries/tables/shape'
import { alterColumnStatement } from '~/core/queries/tables/shape/alter-column'

// Drafts name tables and columns by their original names, so a rename has to
// run after every statement that still names the object.
const APPLY_ORDER: DiagramDraft['kind'][] = [
  'dropForeignKey',
  'createTable',
  'addColumn',
  'alterColumn',
  'addForeignKey',
  'dropColumn',
  'renameColumn',
  'renameTable',
  'dropTable',
]

export const inApplyOrder = (drafts: DiagramDraft[]) =>
  drafts.toSorted(
    (a, b) => APPLY_ORDER.indexOf(a.kind) - APPLY_ORDER.indexOf(b.kind)
  )

export const isDrop = (draft: DiagramDraft) =>
  draft.kind === 'dropTable' ||
  draft.kind === 'dropColumn' ||
  draft.kind === 'dropForeignKey'

export const draftStatement = (
  dialect: Dialect,
  // oxlint-disable-next-line ts/no-explicit-any
  db: Kysely<any>,
  draft: DiagramDraft
): CompiledQuery => {
  switch (draft.kind) {
    case 'createTable': {
      return createTableStatement(dialect, db, draft)
    }
    case 'renameTable': {
      return renameTableStatement(dialect, db, draft)
    }
    case 'dropTable': {
      return dropTableStatement(dialect, db, draft)
    }
    case 'addColumn': {
      return addColumnStatement(dialect, db, draft)
    }
    case 'renameColumn': {
      return renameColumnStatement(dialect, db, draft)
    }
    case 'alterColumn': {
      return alterColumnStatement(dialect, db, draft)
    }
    case 'dropColumn': {
      return dropColumnStatement(dialect, db, draft)
    }
    case 'addForeignKey': {
      return addConstraint(db, draft, {
        ...draft,
        expression: '',
        kind: 'foreignKey',
      }).compile()
    }
    case 'dropForeignKey': {
      return dropConstraintStatement(dialect, db, {
        ...draft,
        cascade: false,
        kind: 'foreignKey',
      })
    }
    default: {
      return draft satisfies never
    }
  }
}
