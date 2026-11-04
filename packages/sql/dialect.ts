import { COMMON_FUNCTIONS, COMMON_KEYWORDS, COMMON_TYPES } from './vocabulary'

export type NameCase = 'lower' | 'upper'

export interface DialectSpec {
  alternativeQuotes: boolean
  identifierQuotes: readonly string[]
  dollarQuotes: boolean
  backslashEscapes: boolean
  hashComments: boolean
  /** MySQL: `--` starts a comment only before whitespace or a control character, so `1--1` is `1 - -1`. */
  spacedDashComments: boolean
  /** Postgres reads every non-ASCII character, a no-break space included, as part of a name, so `€$a$` is a name and not a dollar quote. */
  nonAsciiNames: boolean
  /** The case an unquoted name folds to; `null` where the engine compares names without case. */
  nameCase: NameCase | null
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
  dollarQuotes: false,
  goBatches: false,
  hashComments: false,
  identifierQuotes: ['"'],
  nameCase: null,
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
