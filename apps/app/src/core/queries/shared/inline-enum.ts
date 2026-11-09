interface EnumValue {
  // The catalog value this one was loaded as; absent for a value added in the form.
  origin?: string
  value: string
}

export interface RenamedValue {
  from: string
  to: string
}

export interface InlineEnum {
  keyword: string
  parse: (columnType: string) => string[] | null
  // `previous` is the type before the edit, so a kept value keeps its number.
  spell: (values: EnumValue[], previous: string) => string
}

const controlChars = new Map([
  ['0', '\0'],
  ['b', '\b'],
  ['f', '\f'],
  ['n', '\n'],
  ['r', '\r'],
  ['t', '\t'],
])

const escapeLetters = new Map(
  Array.from(controlChars, ([letter, char]) => [char, letter])
)

const escapedCharRegex = /\\(?<char>.)/gsu

const unescape = (text: string) =>
  text.replaceAll(
    escapedCharRegex,
    (_match, char: string) => controlChars.get(char) ?? char
  )

const escape = (value: string, escaped: RegExp) =>
  value.replaceAll(escaped, (char) => `\\${escapeLetters.get(char) ?? char}`)

// Each catalog escapes exactly these, so an unchanged type respells
// character for character.
const mysqlEscapedRegex = /[\\\n\r\0]/gu
const clickhouseEscapedRegex = /[\\'\b\f\n\r\t\0]/gu

const mysqlQuotedRegex = /'(?<value>(?:[^'\\]|''|\\.)*)'/gsu

export const mysqlQuotedValues = (text: string) =>
  Array.from(text.matchAll(mysqlQuotedRegex), (match) =>
    unescape((match.groups?.value ?? '').replaceAll("''", "'"))
  )

const clickhouseEntryRegex =
  /'(?<value>(?:[^'\\]|\\.)*)'\s*=\s*(?<number>-?\d+)/gsu

export const clickhouseEnumEntries = (text: string) =>
  Array.from(text.matchAll(clickhouseEntryRegex), (match) => ({
    number: Number(match.groups?.number),
    value: unescape(match.groups?.value ?? ''),
  }))

const mysqlEnumRegex = /^enum\(.*\)$/isu

export const mysqlEnum: InlineEnum = {
  keyword: 'enum',
  parse: (columnType) =>
    mysqlEnumRegex.test(columnType) ? mysqlQuotedValues(columnType) : null,
  spell: (values) =>
    `enum(${values.map(({ value }) => `'${escape(value, mysqlEscapedRegex).replaceAll("'", "''")}'`).join(',')})`,
}

const duckdbEnumRegex = /^ENUM\(.*\)$/su
const duckdbQuotedRegex = /'(?<value>(?:[^']|'')*)'/gsu

/** DuckDB doubles a quote and escapes nothing else, in the catalog's spelling and in its own. */
export const duckdbEnum: InlineEnum = {
  keyword: 'ENUM',
  parse: (columnType) =>
    duckdbEnumRegex.test(columnType)
      ? Array.from(columnType.matchAll(duckdbQuotedRegex), (match) =>
          (match.groups?.value ?? '').replaceAll("''", "'")
        )
      : null,
  spell: (values) =>
    `ENUM(${values.map(({ value }) => `'${value.replaceAll("'", "''")}'`).join(', ')})`,
}

const clickhouseEnumRegex = /^Enum(?:8|16)?\(.*\)$/su

const ENUM8 = { max: 127, min: -128 }

export const clickhouseEnum: InlineEnum = {
  keyword: 'Enum',
  parse: (columnType) =>
    clickhouseEnumRegex.test(columnType)
      ? clickhouseEnumEntries(columnType).map((entry) => entry.value)
      : null,
  // ClickHouse refuses renumbering a stored value, and the catalog lists values by number, so every save would read as a change.
  spell: (values, previous) => {
    const kept = new Map(
      clickhouseEnumRegex.test(previous)
        ? clickhouseEnumEntries(previous).map((entry) => [
            entry.value,
            entry.number,
          ])
        : []
    )
    const keptNumber = ({ origin }: EnumValue) =>
      origin === undefined ? undefined : kept.get(origin)
    const highest = Math.max(0, ...kept.values())
    const fresh = values.filter((value) => keptNumber(value) === undefined)
    const entries = values
      .map((value) => ({
        number: keptNumber(value) ?? highest + fresh.indexOf(value) + 1,
        value: value.value,
      }))
      .toSorted((a, b) => a.number - b.number)
    const bits =
      previous.startsWith('Enum16(') ||
      entries.some(({ number }) => number < ENUM8.min || number > ENUM8.max)
        ? 16
        : 8

    return `Enum${bits}(${entries.map(({ number, value }) => `'${escape(value, clickhouseEscapedRegex)}' = ${number}`).join(', ')})`
  },
}
