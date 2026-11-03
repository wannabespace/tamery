import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { log } from '@clack/prompts'
import { BRIDGE_INSTALL_COMMANDS } from '@tamery/shared/bridge'
import { Result } from 'better-result'

import { env } from '../env'
import { paint } from '../paint'
import { updates } from '../update-check'

const isWindows = process.platform === 'win32'
const fromScript =
  updates.installer === 'shell' || updates.installer === 'powershell'
/** Sync with `INSTALL_DIR` in `apps/main/public/cli/install.sh` and `$dir` in `install.ps1`. */
const SCRIPT_BINARY = path.join(
  os.homedir(),
  '.tamery',
  'bin',
  isWindows ? 'tamery.exe' : 'tamery'
)

/** npm's `.ps1` shims fail under PowerShell's default execution policy, so package managers go through cmd. */
const shellArgs = (command: string) => {
  if (!isWindows) {
    return ['sh', '-c', command]
  }
  return fromScript
    ? ['powershell.exe', '-NoProfile', '-Command', command]
    : ['cmd.exe', '/d', '/s', '/c', command]
}

/**
 * Windows can't delete a running .exe, and a package manager deletes the package folder it sits in, but it can be moved:
 * out of the folder, onto the same drive. Returns where it went, to put it back if the update fails.
 */
const moveRunningBinaryAside = () => {
  if (!isWindows || fromScript) {
    return null
  }
  const aside = path.join(os.tmpdir(), `tamery-${process.pid}.exe`)
  return Result.try(() => fs.renameSync(process.execPath, aside)).isOk()
    ? aside
    : null
}

export const update = async () => {
  const fetched = await updates.fetchLatest()
  const latest = fetched.unwrapOr(null)
  if (!latest) {
    throw new Error(
      'Could not look up the latest version. Check your connection.'
    )
  }
  if (!updates.isNewer(latest)) {
    log.success(`Tamery CLI ${env.VERSION} is the latest version.`)
    return
  }

  const install = BRIDGE_INSTALL_COMMANDS[updates.installer]
  // Pinned, here and through TAMERY_VERSION, so neither a stale registry cache nor the user's own TAMERY_VERSION installs another version.
  const command = fromScript ? install : `${install}@${latest}`
  log.step(`Updating ${env.VERSION} to ${latest}: ${paint.dim(command)}`)

  const aside = moveRunningBinaryAside()
  const exitCode = await Bun.spawn(shellArgs(command), {
    env: { ...process.env, TAMERY_VERSION: latest },
    stdio: ['inherit', 'inherit', 'inherit'],
  }).exited
  if (exitCode !== 0) {
    if (aside && !fs.existsSync(process.execPath)) {
      fs.renameSync(aside, process.execPath)
    }
    throw new Error(
      `Update failed: ${command} exited with code ${exitCode}. Fix the error above and run ${paint.accent('tamery update')} again${isWindows && !fromScript ? ', after stopping any running tamery bridge' : ''}.`
    )
  }

  log.success(
    `Updated to ${latest}. Restart ${paint.accent('tamery bridge')} if it is running.`
  )
  if (fromScript && path.relative(SCRIPT_BINARY, process.execPath) !== '') {
    log.warn(
      `The update went to ${SCRIPT_BINARY}, but this tamery is ${process.execPath}. Delete it, or replace it with the new one.`
    )
  }
}
