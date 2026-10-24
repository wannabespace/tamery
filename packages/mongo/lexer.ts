const QUOTES = new Set(['"', "'", '`'])
/** A `/` after one of these opens a regex literal; after anything else it divides. */
const REGEX_PRECEDERS = new Set([
  '',
  '!',
  '&',
  '(',
  ',',
  ':',
  ';',
  '=',
  '?',
  '[',
  '{',
  '|',
  '}',
])

export interface CodeChar {
  char: string
  index: number
}

/**
 * The characters outside strings, comments and regex literals. `state.open` names the literal or comment the text ends
 * inside, which is where completion has nothing to offer.
 */
export const codeChars = (text: string, end = text.length) => {
  const chars: CodeChar[] = []
  const state: { open: 'comment' | 'regex' | 'string' | null } = { open: null }
  let previous = ''
  let index = 0

  const skipTo = (closing: string, from: number) => {
    let at = from
    while (at < end) {
      if (text[at] === '\\') {
        at += 2
        continue
      }
      if (text.startsWith(closing, at)) {
        return at + closing.length
      }
      at += 1
    }
    return null
  }

  while (index < end) {
    const char = text[index] ?? ''
    const next = text[index + 1]
    let open: typeof state.open = null
    let closedAt: number | null = null

    if (QUOTES.has(char)) {
      open = 'string'
      closedAt = skipTo(char, index + 1)
    } else if (char === '/' && next === '/') {
      open = 'comment'
      const lineEnd = text.indexOf('\n', index)
      closedAt = lineEnd === -1 || lineEnd >= end ? null : lineEnd
    } else if (char === '/' && next === '*') {
      open = 'comment'
      closedAt = skipTo('*/', index + 2)
    } else if (char === '/' && REGEX_PRECEDERS.has(previous)) {
      open = 'regex'
      closedAt = skipTo('/', index + 1)
    }

    if (open) {
      if (closedAt === null) {
        state.open = open
        return { chars, state }
      }
      index = closedAt
      if (open !== 'comment') {
        previous = 'literal'
      }
      continue
    }

    chars.push({ char, index })
    if (!/\s/u.test(char)) {
      previous = char
    }
    index += 1
  }
  return { chars, state }
}
