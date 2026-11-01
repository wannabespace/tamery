#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'

const isMusl = () =>
  process.platform === 'linux' &&
  !process.report.getReport().header.glibcVersionRuntime

const os = process.platform === 'win32' ? 'windows' : process.platform
const target = `${os}-${process.arch}${isMusl() ? '-musl' : ''}`

const findBinary = () => {
  try {
    return createRequire(import.meta.url).resolve(
      `tamery-${target}/bin/tamery${process.platform === 'win32' ? '.exe' : ''}`
    )
  } catch {
    console.error(
      `The Tamery CLI has no build for ${target}, or npm skipped the optional dependency tamery-${target}. Reinstall without --omit=optional or --no-optional: npm i -g tamery`
    )
    return process.exit(1)
  }
}

const binary = findBinary()

// Ctrl+C reaches the binary too, which stops on its own; without a listener Node would quit first and lose its exit code.
// oxlint-disable-next-line eslint/no-empty-function
process.on('SIGINT', () => {})

const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' })
if (result.error) {
  console.error(`Could not start ${binary}: ${result.error.message}`)
  process.exit(1)
}
if (result.signal) {
  process.removeAllListeners(result.signal)
  process.kill(process.pid, result.signal)
}
process.exit(result.status ?? 1)
