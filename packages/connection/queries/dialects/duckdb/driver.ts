import { createRequire } from 'node:module'

import type * as DuckdbModule from '@duckdb/node-api'

type DuckdbDriver = typeof DuckdbModule

let requireDriver = () =>
  createRequire(import.meta.url)('@duckdb/node-api') as DuckdbDriver
let driver: DuckdbDriver | null = null

/** Loaded on first use. The bridge's binary ships without it and plugs in a copy it installs into a folder of its own. */
export const duckdbDriver = {
  load: () => {
    driver ??= requireDriver()
    return driver
  },
  use: (require: () => DuckdbDriver) => {
    requireDriver = require
  },
}
