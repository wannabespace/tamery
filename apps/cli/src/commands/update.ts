import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { log } from '@clack/prompts'
import { BRIDGE_INSTALL_COMMANDS } from '@tamery/shared/bridge'
import { toError } from '@tamery/shared/utils'
import { Result } from 'better-result'

import { env } from '../env'
import { paint } from '../paint'
import { updates } from '../update-check'

const UPDATE_TIMEOUT_MS = 30_000
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

/**
 * `curl … | sh` exits 0 when curl fails, so the script is downloaded and checked here. npm's `.ps1` shims fail under
 * PowerShell's default execution policy, so package managers on Windows go through cmd.
 */
const run = async (command: string, version: string) => {
  const options = {
    env: { ...process.env, TAMERY_VERSION: version },
    stderr: 'inherit',
    stdout: 'inherit',
  } as const
  if (updates.installer === 'shell') {
    const script = await fetch(`${env.MAIN_URL}/cli/install.sh`, {
      signal: AbortSignal.timeout(UPDATE_TIMEOUT_MS),
    })
    if (!script.ok) {
      throw new Error(
        `Could not download the install script: ${env.MAIN_URL} answered ${script.status}.`
      )
    }
    return Bun.spawn(['sh', '-s'], { ...options, stdin: script }).exited
  }
  const spawn = (args: string[]) =>
    Bun.spawn(args, { ...options, stdin: 'inherit' }).exited
  if (!isWindows) {
    return spawn(['sh', '-c', command])
  }
  return spawn(
    fromScript
      ? ['powershell.exe', '-NoProfile', '-Command', command]
      : ['cmd.exe', '/d', '/s', '/c', command]
  )
}

/**
 * Windows can't delete a running .exe, and a package manager replaces the package folder it sits in, but it can be
 * renamed on its own drive: beside the global `node_modules`, outside that folder. One name, so the last update's copy
 * is deleted here, unless a bridge started before that update still runs it.
 */
const moveRunningBinaryAside = () => {
  if (!isWindows || fromScript) {
    return null
  }
  const prefix = process.execPath.slice(
    0,
    process.execPath.toLowerCase().indexOf('\\node_modules\\')
  )
  const aside = path.join(prefix, 'tamery.exe.old')
  const moved = Result.try(() => {
    fs.rmSync(aside, { force: true })
    fs.renameSync(process.execPath, aside)
  })
  if (moved.isErr()) {
    throw new Error(
      `Could not move ${process.execPath} aside to replace it: ${toError(moved.error.cause).message} Stop any running tamery bridge and try again.`
    )
  }
  return aside
}

const putBack = (aside: string) =>
  Result.try(() => {
    if (!fs.existsSync(process.execPath)) {
      fs.mkdirSync(path.dirname(process.execPath), { recursive: true })
      fs.renameSync(aside, process.execPath)
    }
  }).isOk()

export const update = async () => {
  const fetched = await updates.fetchLatest(UPDATE_TIMEOUT_MS)
  if (fetched.isErr()) {
    throw new Error(
      `Could not look up the latest version: ${toError(fetched.error.cause).message}`
    )
  }
  const latest = fetched.value
  if (!updates.isNewer(latest)) {
    log.success(
      `Tamery CLI ${env.VERSION} is up to date. The latest release is ${latest}.`
    )
    return
  }

  const install = BRIDGE_INSTALL_COMMANDS[updates.installer]
  // Pinned, here and through TAMERY_VERSION, so neither the package manager's own idea of latest nor the user's TAMERY_VERSION picks another version.
  const command = fromScript ? install : `${install}@${latest}`
  log.step(`Updating ${env.VERSION} to ${latest}: ${paint.dim(command)}`)

  const aside = moveRunningBinaryAside()
  const ran = await Result.tryPromise(() => run(command, latest))
  if (ran.isErr() || ran.value !== 0 || !fs.existsSync(process.execPath)) {
    const reason = ran.isErr()
      ? toError(ran.error.cause).message
      : `${command} ${ran.value === 0 ? `left no tamery at ${process.execPath}` : `exited with code ${ran.value}`}.`
    const lost =
      aside && !putBack(aside) ? ` The previous tamery is at ${aside}.` : ''
    throw new Error(
      `Update failed: ${reason}${lost} Fix that and run ${paint.accent('tamery update')} again${isWindows ? ', after stopping any running tamery bridge' : ''}.`
    )
  }

  log.success(
    `Updated to ${latest}. Restart ${paint.accent('tamery bridge')} if it is running.`
  )
  const sameBinary = Result.try(
    () =>
      fs.realpathSync.native(SCRIPT_BINARY) ===
      fs.realpathSync.native(process.execPath)
  ).unwrapOr(true)
  if (fromScript && !sameBinary) {
    log.warn(
      `The update went to ${SCRIPT_BINARY}, but this tamery is ${process.execPath}. Delete it, or replace it with the new one.`
    )
  }
}
