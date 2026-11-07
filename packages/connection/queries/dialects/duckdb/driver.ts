import { createRequire } from 'node:module'

import type * as DuckdbModule from '@duckdb/node-api'
import { memoize } from 'memoza'

import { DUCKDB_FILES_ON_DESKTOP } from '../../../database-file'

// Loaded on first use: only the desktop app ships DuckDB, and nothing else opens a file.
export const loadDuckdb = memoize(() => {
  try {
    return createRequire(import.meta.url)(
      '@duckdb/node-api'
    ) as typeof DuckdbModule
  } catch (error) {
    throw new Error(DUCKDB_FILES_ON_DESKTOP, {
      cause: error,
    })
  }
})
