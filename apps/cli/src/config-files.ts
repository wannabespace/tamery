import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const CONFIG_DIR =
  process.env.TAMERY_CONFIG_DIR ?? path.join(os.homedir(), '.config', 'tamery')

export const configFiles = {
  key: path.join(CONFIG_DIR, 'bridge.key'),
  pairings: path.join(CONFIG_DIR, 'bridge.json'),
  remove: (file: string) => fs.rmSync(file, { force: true }),
  requests: path.join(CONFIG_DIR, 'bridge-requests.json'),
  vault: path.join(CONFIG_DIR, 'bridge-secrets.json'),
  /** Written beside the target and renamed over it, so a crash never leaves a half-written vault; `mode` applies only to a file it creates. */
  write: (file: string, data: string) => {
    fs.mkdirSync(CONFIG_DIR, { mode: 0o700, recursive: true })
    fs.chmodSync(CONFIG_DIR, 0o700)
    const temporary = `${file}.${randomUUID()}.tmp`
    fs.writeFileSync(temporary, data, { flag: 'wx', mode: 0o600 })
    fs.renameSync(temporary, file)
  },
}
