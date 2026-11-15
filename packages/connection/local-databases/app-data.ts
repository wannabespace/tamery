import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

/** Where apps keep their settings, the folder Electron calls `appData`. */
export const appDataDir = () => {
  if (process.platform === 'darwin') {
    return path.join(homedir(), 'Library', 'Application Support')
  }
  if (process.platform === 'win32') {
    return process.env.APPDATA ?? path.join(homedir(), 'AppData', 'Roaming')
  }
  return process.env.XDG_CONFIG_HOME ?? path.join(homedir(), '.config')
}
