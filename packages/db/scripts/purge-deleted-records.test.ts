import { expect, test } from 'bun:test'

const JOB_ENV = {
  DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:1/tamery',
  NODE_ENV: 'production',
  PATH: process.env.PATH ?? '',
  S3_ACCESS_KEY_ID: 'key',
  S3_BUCKET: 'bucket',
  S3_ENDPOINT: 'http://127.0.0.1:1',
  S3_SECRET_ACCESS_KEY: 'secret',
}

test('the purge job starts with only the environment its job has', async () => {
  const run = Bun.spawn(
    [
      'bun',
      '--no-env-file',
      new URL('purge-deleted-records.ts', import.meta.url).pathname,
    ],
    { env: JOB_ENV, stderr: 'pipe', stdout: 'pipe' }
  )
  const stderr = await new Response(run.stderr).text()
  await run.exited

  expect(stderr).not.toContain('must be a string')
  expect(stderr).toContain('ECONNREFUSED')
})
