import { expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'

import { type } from 'arktype'

const MIGRATIONS = new URL('../migrations/', import.meta.url)
const KEEP_DELETED_RECORD_TRIGGER =
  /CREATE TRIGGER "keep_deleted_record" AFTER DELETE ON "(?<table>\w+)"/gu
const TABLES_NOT_KEPT = [
  'accounts',
  'ai_usage',
  'deleted_records',
  'early_access',
  'invitations',
  'sessions',
  'subscriptions',
  'two_factors',
  'verifications',
]

const snapshot = type({
  ddl: type({ entityType: 'string', name: 'string' }).array(),
})

test('every table keeps its deleted rows or is listed as left out', async () => {
  const migrations = readdirSync(MIGRATIONS).toSorted()
  const latest = snapshot.assert(
    await Bun.file(
      new URL(`${migrations.at(-1)}/snapshot.json`, MIGRATIONS)
    ).json()
  )
  const sql = await Promise.all(
    migrations.map((migration) =>
      Bun.file(new URL(`${migration}/migration.sql`, MIGRATIONS)).text()
    )
  )
  const kept = Array.from(
    sql.join('\n').matchAll(KEEP_DELETED_RECORD_TRIGGER),
    (match) => match.groups?.table
  )
  const tables = latest.ddl
    .filter(({ entityType }) => entityType === 'tables')
    .map(({ name }) => name)

  expect([...kept, ...TABLES_NOT_KEPT].toSorted()).toEqual(tables.toSorted())
})
