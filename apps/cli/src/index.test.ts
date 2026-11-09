import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const env = {
  ...process.env,
  API_URL: 'https://api.tamery.test',
  MAIN_URL: 'https://tamery.test',
  NO_COLOR: '1',
  TAMERY_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'tamery-cli-')),
  WEB_URL: 'https://app.tamery.test',
}

// Each test starts the whole CLI, which takes over 5 s while the pre-commit hook runs every package's tests at once.
setDefaultTimeout(30_000)

const tamery = (...args: string[]) => {
  const { exitCode, stderr, stdout } = Bun.spawnSync(
    ['bun', path.join(import.meta.dirname, 'index.ts'), ...args],
    { env }
  )
  return { exitCode, output: `${stdout}${stderr}` }
}

describe('commands', () => {
  test('no command prints the help', () => {
    const { exitCode, output } = tamery()
    expect(exitCode).toBe(0)
    expect(output).toContain('bridge')
    expect(output).not.toContain('approve')
    expect(output).toContain('whoami')
  })

  test("a command's help lists only its own options", () => {
    expect(tamery('bridge', '--help').output).toContain('--public-url')
    expect(tamery('bridge', '--help').output).toContain('approve')
    expect(tamery('login', '--help').output).not.toContain('--port')
  })

  test('an unknown command fails', () => {
    const { exitCode, output } = tamery('bogus')
    expect(exitCode).toBe(1)
    expect(output).toContain('Unknown command bogus')
  })

  test('the bridge refuses a port out of range before starting', () => {
    const { exitCode, output } = tamery('bridge', '--port', '0')
    expect(exitCode).toBe(1)
    expect(output).toContain('--port must be a number from 1 to 65535.')
  })

  test('a command group without a subcommand prints its help', () => {
    const { exitCode, output } = tamery('connection')
    expect(exitCode).toBe(0)
    expect(output).toContain('create')
  })

  test("a command's help describes its arguments", () => {
    expect(tamery('query', '--help').output).toContain('Its id or name')
  })

  test('a script that is not signed in fails instead of waiting for a browser', () => {
    const { exitCode, output } = tamery('query', 'prod', 'select 1')
    expect(exitCode).toBe(1)
    expect(output).toContain('Not signed in.')
  })

  test('a connection update with nothing to change fails before signing in', () => {
    const { exitCode, output } = tamery('connection', 'update', 'prod')
    expect(exitCode).toBe(1)
    expect(output).toContain('Nothing to change.')
  })

  test('a query without a statement fails before signing in', () => {
    const { exitCode, output } = tamery('query', 'prod')
    expect(exitCode).toBe(1)
    expect(output).toContain('Pass the statement after the connection')
  })

  test('a subcommand of bridge runs instead of the bridge', () => {
    const { exitCode, output } = tamery('bridge', 'unpair-all')
    expect(exitCode).toBe(0)
    expect(output).toContain('Every browser is unpaired.')
  })
})
