import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

import { log } from '@clack/prompts'
import { duckdbDriver } from '@tamery/connection/queries/dialects/duckdb/driver'
import { type } from 'arktype'

import { configFiles } from '../config-files'

const driverPackages = type('string.json.parse').to(
  type({ integrity: 'string', name: 'string', version: 'string' }).array()
)

type DriverPackage = (typeof driverPackages.infer)[number]

const packageMain = type('string.json.parse').to({ 'main?': 'string' })

const tarballUrl = ({ name, version }: DriverPackage) =>
  `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${version}.tgz`

/** Each package lands where Node's resolution looks from the next: `<folder>/node_modules/<name>`. */
const download = async (driverPackage: DriverPackage, folder: string) => {
  const response = await fetch(tarballUrl(driverPackage))
  if (!response.ok) {
    throw new Error(
      `The bridge could not download DuckDB: npm answered ${response.status} for ${driverPackage.name}.`
    )
  }
  const bytes = await response.bytes()
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
  if (integrity !== driverPackage.integrity) {
    throw new Error(
      `The bridge refused the DuckDB it downloaded: ${driverPackage.name} differs from the one this bridge was built with.`
    )
  }
  const extracted = path.join(folder, 'extracted', driverPackage.name)
  await new Bun.Archive(bytes).extract(extracted)
  const installed = path.join(folder, 'node_modules', driverPackage.name)
  await fs.mkdir(path.dirname(installed), { recursive: true })
  await fs.rename(path.join(extracted, 'package'), installed)
  // A compiled Bun binary reads no package.json on disk, so a package resolves by name only through its root index.js.
  const { main } = packageMain.assert(
    await fs.readFile(path.join(installed, 'package.json'), 'utf-8')
  )
  if (main && path.normalize(main) !== 'index.js') {
    await fs.writeFile(
      path.join(installed, 'index.js'),
      `module.exports = require(${JSON.stringify(`./${path.normalize(main)}`)})\n`,
      { flag: 'wx' }
    )
  }
}

const isInstalled = (folder: string) =>
  fs.access(path.join(folder, 'node_modules', '@duckdb/node-api')).then(
    () => true,
    () => false
  )

/** Built into a folder of its own and renamed into place whole, so a download cut short never looks installed. */
const install = async (packages: DriverPackage[], folder: string) => {
  if (await isInstalled(folder)) {
    return
  }
  log.step('Downloading DuckDB for the bridge. This happens once.')
  await fs.mkdir(configFiles.duckdb, { mode: 0o700, recursive: true })
  const staging = `${folder}.${randomUUID()}.tmp`
  try {
    await Promise.all(packages.map((item) => download(item, staging)))
    await fs.rm(path.join(staging, 'extracted'), { recursive: true })
    // Another bridge may have finished first, which leaves its copy in place.
    await fs.rename(staging, folder).catch(async (error: unknown) => {
      if (!(await isInstalled(folder))) {
        throw error
      }
    })
  } finally {
    await fs.rm(staging, { force: true, recursive: true })
  }
}

let installing: Promise<void> | null = null

const installOnce = async (packages: DriverPackage[], folder: string) => {
  try {
    await install(packages, folder)
  } catch (error) {
    // A failed download is tried again on the next DuckDB file.
    installing = null
    throw error
  }
  duckdbDriver.use(() =>
    createRequire(path.join(folder, 'index.js'))('@duckdb/node-api')
  )
}

/**
 * The binary ships without DuckDB's driver, tens of megabytes per platform: the build pins this platform's packages and
 * the bridge installs them on its first DuckDB file. A run from source loads the workspace's own.
 */
export const installDuckdb = () => {
  if (!import.meta.env.DUCKDB_PACKAGES) {
    return Promise.resolve()
  }
  const packages = driverPackages.assert(import.meta.env.DUCKDB_PACKAGES)
  installing ??= installOnce(
    packages,
    path.join(configFiles.duckdb, packages[0]?.version ?? '')
  )
  return installing
}
