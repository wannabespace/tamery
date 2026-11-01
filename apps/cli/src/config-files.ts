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
  vault: path.join(CONFIG_DIR, 'bridge-secrets.json'),
  write: (file: string, data: string) => {
    fs.mkdirSync(CONFIG_DIR, { mode: 0o700, recursive: true })
    fs.writeFileSync(file, data, { mode: 0o600 })
  },
}
