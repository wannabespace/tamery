export interface SchemaNoteText {
  column: string | null
  note: string
  schema: string | null
  table: string | null
}

export type SchemaNoteScope =
  | { kind: 'database' }
  | { kind: 'table'; schema: string | null; table: string }
  | { column: string; kind: 'column'; schema: string | null; table: string }

export const getNoteScope = ({
  column,
  schema,
  table,
}: Omit<SchemaNoteText, 'note'>): SchemaNoteScope => {
  if (!table) {
    return { kind: 'database' }
  }
  return column
    ? { column, kind: 'column', schema, table }
    : { kind: 'table', schema, table }
}

const getTarget = (note: SchemaNoteText) => {
  const scope = getNoteScope(note)
  if (scope.kind === 'database') {
    return 'the database'
  }
  return [scope.schema, scope.table, scope.kind === 'column' && scope.column]
    .filter(Boolean)
    .join('.')
}

/** The user's schema notes as a prompt section, or nothing when there are none. Every AI prompt about a database adds it. */
export const formatSchemaNotes = (notes: SchemaNoteText[]) =>
  notes.length === 0
    ? ''
    : [
        'Notes the user keeps about this database (facts its schema does not say; prefer them over guesses from names):',
        ...notes.map((note) => `- ${getTarget(note)}: ${note.note}`),
      ].join('\n')
