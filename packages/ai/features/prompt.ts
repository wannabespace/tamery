import { ConnectionType } from '@tamery/shared/enums/connection-type'

export const section = (label: string, body: string) =>
  [`=======${label}=======`, body, `=======END OF ${label}=======`].join('\n')

export const EDITOR_CONTEXT =
  'You also get the whole editor the SQL comes from, as context only: its other statements may be unrelated to this one. Use them for style and names when they help, and never copy or return them.'

export const MATCH_USER_STYLE =
  "Match the user's formatting exactly: keyword and identifier casing, spacing around operators and commas, quoting, indentation and line breaks."

export const MONGOSH_OUTPUT_RULES = [
  'The database is MongoDB: queries are mongosh calls such as db.orders.find({ status: "paid" }) or db.orders.aggregate([...]), never SQL. Collections are its tables, fields its columns.',
  MATCH_USER_STYLE,
  'Return only mongosh code, nothing else: no explanations, greetings, markdown, or ``` fences.',
  'The output is pasted directly into the editor and runs one db.<collection>.<method>(…) call chain per statement: no variables, functions, arrow functions, loops, or cursor iteration such as forEach or map — only calls and their cursor methods run.',
  'Write literal values and BSON constructors (ObjectId("…"), ISODate("…"), NumberLong("…")); when a value is unknown, use the shortest generic literal of the right type, never invented realistic-looking data.',
]

export const queryOutputRules = (connectionType: string) =>
  connectionType === ConnectionType.MongoDB
    ? MONGOSH_OUTPUT_RULES
    : [
        `The database type is "${connectionType}".`,
        MATCH_USER_STYLE,
        'Return only SQL, nothing else: no explanations, greetings, markdown, or ``` fences.',
        'The output is pasted directly into a SQL editor.',
        'The SQL runs as typed, with nothing bound: never use placeholders or bind parameters ($1, ?, :name, @p1). Write literal values; when a value is unknown, use the shortest generic literal of the right type, never invented realistic-looking data.',
      ]
