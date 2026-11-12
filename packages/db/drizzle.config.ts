import process from 'node:process'

import { type } from 'arktype'
import { defineConfig } from 'drizzle-kit'

// Not ./env: the migrate job gets DATABASE_URL alone, so ./env would fail to load on
// the missing ENCRYPTION_SECRET/USER_KEY_SECRET.
const { DATABASE_URL, NODE_ENV } = type({
  DATABASE_URL: 'string',
  'NODE_ENV?': 'string',
}).assert(process.env)

export default defineConfig({
  dbCredentials: {
    url: DATABASE_URL,
  },
  dialect: 'postgresql',
  ...(NODE_ENV === 'test' && { driver: 'pglite' }),
  out: './migrations',
  schema: './schema/index.ts',
})
