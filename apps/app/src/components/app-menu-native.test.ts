import { expect, test } from 'bun:test'

import * as icons from '@hugeicons/core-free-icons'
import { Glob } from 'bun'

import { sfSymbols } from './app-menu-native'

const MENU_ICON =
  /\bicon: (?:\w+ \? (?<whenTrue>\w+Icon) : )?(?<icon>\w+Icon)\b/gu
const SRC = `${import.meta.dir}/..`

test('every icon a menu shows has an SF Symbol for the native menu', async () => {
  const byName = new Map(Object.entries(icons))
  const missing = new Set<string>()
  for await (const path of new Glob('**/*.{ts,tsx}').scan(SRC)) {
    const source = await Bun.file(`${SRC}/${path}`).text()
    if (!/AppMenuNode|onSelect:/u.test(source)) {
      continue
    }
    for (const { groups } of source.matchAll(MENU_ICON)) {
      for (const name of [groups?.whenTrue, groups?.icon]) {
        const icon = name && byName.get(name)
        if (name && !(icon && sfSymbols.has(icon))) {
          missing.add(name)
        }
      }
    }
  }
  expect([...missing]).toEqual([])
})
