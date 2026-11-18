import { createConstraintQuery } from '~/core/queries/constraints/create'
import { dropConstraintQuery } from '~/core/queries/constraints/drop'
import { addColumnQuery } from '~/core/queries/tables/add-column'
import { alterColumnQuery } from '~/core/queries/tables/alter-column'
import { createTableQuery } from '~/core/queries/tables/create'
import { dropTableQuery } from '~/core/queries/tables/drop'
import { dropColumnQuery } from '~/core/queries/tables/drop-column'
import { renameTableQuery } from '~/core/queries/tables/rename'
import { renameColumnQuery } from '~/core/queries/tables/rename-column'

import type { DiagramDraft } from './statements'

export const draftQuery = (draft: DiagramDraft) => {
  switch (draft.kind) {
    case 'createTable': {
      return createTableQuery(draft)
    }
    case 'renameTable': {
      return renameTableQuery({
        newTable: draft.newName,
        oldTable: draft.table,
        schema: draft.schema,
      })
    }
    case 'dropTable': {
      return dropTableQuery({
        cascade: draft.cascade,
        schema: draft.schema,
        table: draft.table,
      })
    }
    case 'addColumn': {
      return addColumnQuery(draft)
    }
    case 'renameColumn': {
      return renameColumnQuery({
        newColumn: draft.newName,
        oldColumn: draft.column,
        schema: draft.schema,
        table: draft.table,
      })
    }
    case 'alterColumn': {
      return alterColumnQuery(draft)
    }
    case 'dropColumn': {
      return dropColumnQuery(draft)
    }
    case 'addForeignKey': {
      return createConstraintQuery({
        schema: draft.schema,
        shape: { ...draft, expression: '', kind: 'foreignKey' },
        table: draft.table,
      })
    }
    case 'dropForeignKey': {
      return dropConstraintQuery({
        cascade: false,
        kind: 'foreignKey',
        name: draft.name,
        schema: draft.schema,
        table: draft.table,
      })
    }
    default: {
      return draft satisfies never
    }
  }
}
