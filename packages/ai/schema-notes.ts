export interface SchemaNoteText {
  column: string | null
  note: string
  schema: string | null
  table: string | null
}

const getTarget = ({ column, schema, table }: SchemaNoteText) =>
  table ? [schema, table, column].filter(Boolean).join('.') : 'the database'

/** The user's schema notes as a prompt section, or nothing when there are none. Every AI prompt about a database adds it. */
export const formatSchemaNotes = (notes: SchemaNoteText[]) =>
  notes.length === 0
    ? ''
    : [
        'Notes the user keeps about this database (facts its schema does not say; prefer them over guesses from names):',
        ...notes.map((note) => `- ${getTarget(note)}: ${note.note}`),
      ].join('\n')
