import { COMMON_FUNCTIONS, COMMON_KEYWORDS, COMMON_TYPES } from './vocabulary'

export type NameCase = 'lower' | 'upper'

export const CASE_INSENSITIVE = null

export interface DialectSpec {
  alternativeQuotes: boolean
  identifierQuotes: readonly string[]
  dollarQuotes: boolean
  backslashEscapes: boolean
  /** Words an END takes to close a block of their own, as MySQL's `END IF` and `END LOOP`; matched by text, since LOOP, WHILE and REPEAT are keywords in no dialect's list. An END closes one only while such a block is open, so an alias or label spelled the same still ends a CASE or BEGIN. */
  blockEndQualifiers: readonly string[]
  hashComments: boolean
  /** MySQL: `--` starts a comment only before whitespace or a control character, so `1--1` is `1 - -1`. */
  spacedDashComments: boolean
  /** Postgres reads every non-ASCII character, a no-break space included, as part of a name, so `€$a$` is a name and not a dollar quote. */
  nonAsciiNames: boolean
  /** The case an unquoted name folds to. */
  nameCase: NameCase | typeof CASE_INSENSITIVE
  atVariables: boolean
  goBatches: boolean
  /** Oracle: `DECLARE`, `BEGIN` and `CREATE FUNCTION`/`PROCEDURE`/`PACKAGE`/`TRIGGER`/`TYPE` run to a `/` line, and a `/` line also ends any other statement. */
  plsqlUnits: boolean
  separatorFreeStatements: boolean
  /** `BEGIN … COMMIT` really runs as a transaction; ClickHouse's driver only fakes commit and rollback. */
  transactions: boolean
  functions: ReadonlySet<string>
  keywords: ReadonlySet<string>
  types: ReadonlySet<string>
}

export const spec = (
  overrides: Partial<Omit<DialectSpec, 'functions' | 'keywords' | 'types'>> & {
    functions?: string[]
    keywords?: string[]
    types?: string[]
  }
): DialectSpec => ({
  alternativeQuotes: false,
  atVariables: false,
  backslashEscapes: false,
  blockEndQualifiers: [],
  dollarQuotes: false,
  goBatches: false,
  hashComments: false,
  identifierQuotes: ['"'],
  nameCase: CASE_INSENSITIVE,
  nonAsciiNames: false,
  plsqlUnits: false,
  separatorFreeStatements: false,
  spacedDashComments: false,
  transactions: true,
  ...overrides,
  functions: new Set([...COMMON_FUNCTIONS, ...(overrides.functions ?? [])]),
  keywords: new Set([...COMMON_KEYWORDS, ...(overrides.keywords ?? [])]),
  types: new Set([...COMMON_TYPES, ...(overrides.types ?? [])]),
})
