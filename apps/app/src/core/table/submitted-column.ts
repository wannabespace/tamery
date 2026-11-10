import type { DraftState, NewColumn } from '~/core/queries/tables/shape'

import type { ReferenceTarget } from './use-reference-targets'

export interface EditableColumn extends NewColumn {
  // Omitted hides the comment field and leaves the stored comment alone.
  comment?: string | null
  foreign: boolean
  // Name in the database; differs from `name` while a rename is pending.
  id: string
  state?: DraftState
}

export interface EditableTable {
  columns: Pick<EditableColumn, 'id' | 'name'>[]
  name: string
  state?: DraftState
}

export type SubmittedColumn = NewColumn & Pick<EditableColumn, 'comment'>

export const changed = (
  column: EditableColumn | null,
  next: SubmittedColumn,
  reference: ReferenceTarget | null
) =>
  column === null ||
  reference !== null ||
  next.name !== column.name ||
  next.type !== column.type ||
  next.nullable !== column.nullable ||
  next.comment !== column.comment

export const normalized = (
  column: EditableColumn | null,
  { comment, name, nullable, primaryKey, type }: SubmittedColumn
): SubmittedColumn => ({
  comment: comment === column?.comment ? comment : comment?.trim() || null,
  name: name.trim(),
  nullable,
  primaryKey,
  type,
})

export const getErrors = (
  { column, table }: { column: EditableColumn | null; table: EditableTable },
  next: NewColumn,
  enumValues: string[] | null,
  submitted: boolean
) => {
  const nameBecomesId = column === null || column.state === 'added'
  const taken = table.columns.some(
    (other) =>
      other.id !== column?.id &&
      (other.name === next.name || (nameBecomesId && other.id === next.name))
  )
  const missingName = submitted ? 'Give the column a name.' : undefined
  const missingValues =
    submitted && enumValues?.length === 0
      ? 'Add at least one value.'
      : undefined
  return {
    name: next.name
      ? taken && 'This table already has a column with this name'
      : missingName,
    type:
      submitted && !next.type ? "Pick or write the column's type." : undefined,
    values:
      enumValues && new Set(enumValues).size < enumValues.length
        ? 'Each value must be unique.'
        : missingValues,
  }
}
