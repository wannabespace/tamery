import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { Result } from 'better-result'

const CONFIG_DIR =
  process.env.TAMERY_CONFIG_DIR ?? path.join(os.homedir(), '.config', 'tamery')

const writeTemporary = (file: string, data: string) => {
  fs.mkdirSync(path.dirname(file), { mode: 0o700, recursive: true })
  fs.chmodSync(CONFIG_DIR, 0o700)
  const temporary = `${file}.${randomUUID()}.tmp`
  fs.writeFileSync(temporary, data, { flag: 'wx', mode: 0o600 })
  return temporary
}

/**
 * One file per browser and per request, each written once and read on every call: the bridge and the commands run in
 * separate processes, and a whole-file rewrite by one would drop what the other wrote meanwhile.
 */
export const configFiles = {
  browsers: path.join(CONFIG_DIR, 'bridge-browsers'),
  dir: CONFIG_DIR,
  /** `false` when the file already exists: the first writer wins, across processes too. */
  create: (file: string, data: string) => {
    const temporary = writeTemporary(file, data)
    const linked = Result.try(() => fs.linkSync(temporary, file))
    fs.rmSync(temporary, { force: true })
    if (linked.isOk()) {
      return true
    }
    if (fs.existsSync(file)) {
      return false
    }
    throw linked.error.cause
  },
  key: path.join(CONFIG_DIR, 'bridge.key'),
  /** Skips a file removed while it was listed. */
  readAll: <T>(dir: string, file: { assert: (text: string) => T }) =>
    fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((name) => name.endsWith('.json'))
          .flatMap((name) => {
            const read = Result.try(() =>
              fs.readFileSync(path.join(dir, name), 'utf-8')
            )
            return read.isOk()
              ? [{ ...file.assert(read.value), id: path.parse(name).name }]
              : []
          })
      : [],
  remove: (file: string) => fs.rmSync(file, { force: true, recursive: true }),
  requests: path.join(CONFIG_DIR, 'bridge-requests'),
  vault: path.join(CONFIG_DIR, 'bridge-secrets.json'),
  /** Written beside the target and renamed over it, so a crash never leaves a half-written vault. */
  write: (file: string, data: string) => {
    fs.renameSync(writeTemporary(file, data), file)
  },
}
