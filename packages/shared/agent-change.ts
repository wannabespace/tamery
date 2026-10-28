import { type } from 'arktype'

const values = type('Record<string, unknown>').describe('Column name to value')

const newColumn = type({
  name: 'string',
  nullable: 'boolean',
  primaryKey: 'boolean',
  type: type.string.describe("A type in the connection's own dialect"),
})

/** A change an agent proposes for the user to review: rows land in the table's drafts, schema changes in the visualizer's. */
export const agentChangeType = type.or(
  {
    kind: "'update_rows'",
    rows: type({
      key: values.describe("The row's primary key columns and values"),
      set: values,
    }).array(),
  },
  { kind: "'insert_rows'", rows: values.array() },
  {
    kind: "'delete_rows'",
    keys: values.describe('Primary key columns and values').array(),
  },
  { columns: newColumn.array(), kind: "'create_table'" },
  { column: newColumn, kind: "'add_column'" },
  { column: 'string', kind: "'rename_column'", newName: 'string' },
  { column: 'string', kind: "'drop_column'" },
  { kind: "'rename_table'", newName: 'string' },
  { kind: "'drop_table'" },
  {
    columns: 'string[]',
    kind: "'add_index'",
    name: type('string | null').describe('null for a name Tamery picks'),
    unique: 'boolean',
  }
)

export type AgentChange = typeof agentChangeType.infer

export const PROPOSE_CHANGE_DESCRIPTION =
  "Propose a change for the user to review and apply in Tamery's own review, instead of running it: row updates, inserts and deletes go into the table's drafts, schema changes into the visualizer's drafts. Nothing reaches the database until the user applies it there. Recommend an index with add_index after explain shows a scan it would fix. Prefer it over execute for anything it can express; update_rows and delete_rows name each row by its full primary key."
