import process from 'node:process'

import { type } from 'arktype'
import { defineConfig } from 'drizzle-kit'

// Not ./env: migrations run as the deploy's pre-deploy command, outside the KMS unwrap,
// so ENCRYPTION_SECRET/USER_KEY_SECRET are absent there and ./env would fail to load.
const { DATABASE_URL, NODE_ENV } = type({
  'DATABASE_URL': 'string',
  'NODE_ENV?': 'string',
}).assert(process.env)

export default defineConfig({
  schema: './schema/index.ts',
  out: './migrations',
  ...(NODE_ENV === 'test' && { driver: 'pglite' }),
  dialect: 'postgresql',
  dbCredentials: {
    url: DATABASE_URL,
  },
})
