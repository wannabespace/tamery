import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { type } from 'arktype'

import { env } from '../src/env'
import type { Target } from './targets'
import { getBinaryName, isTarget, TARGETS } from './targets'

const DIST = path.join(import.meta.dirname, '..', 'dist')
const CONNECTION_SOURCE = /packages\/connection\/.+\.ts$/u
const LOCKFILE = path.join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'pnpm-lock.yaml'
)
const DUCKDB_API = '@duckdb/node-api'
const DUCKDB_BINDINGS = '@duckdb/node-bindings'

const lockfile = type({
  catalogs: { default: { [DUCKDB_API]: { version: 'string' } } },
  packages: { '[string]': { resolution: { 'integrity?': 'string' } } },
  snapshots: { '[string]': { 'dependencies?': { '[string]': 'string' } } },
})

/**
 * What the bridge downloads on its first DuckDB file, pinned to the lockfile's versions and checksums: the binding of this
 * target alone, since each platform's is tens of megabytes.
 */
const getDuckdbPackages = async (target: Target) => {
  // pnpm writes its own environment's document first and the workspace's last.
  const { catalogs, packages, snapshots } = lockfile.assert(
    [Bun.YAML.parse(await Bun.file(LOCKFILE).text())].flat().at(-1)
  )
  const { version } = catalogs.default[DUCKDB_API]
  const bindings = `${DUCKDB_BINDINGS}@${version}`
  return [
    [DUCKDB_API, version],
    [DUCKDB_BINDINGS, version],
    [`${DUCKDB_BINDINGS}-${target.replace('windows', 'win32')}`, version],
    ...Object.entries(snapshots[bindings]?.dependencies ?? {}),
  ].map(([name, pinned]) => {
    const integrity = packages[`${name}@${pinned}`]?.resolution.integrity
    if (!integrity) {
      throw new Error(`pnpm-lock.yaml has no checksum for ${name}@${pinned}.`)
    }
    return { integrity, name, version: pinned }
  })
}

/**
 * `@tamery/connection` loads its drivers through `createRequire(import.meta.url)`, which the bundler cannot follow, so the
 * binary would ship without them. The bundler's own `require` loads the same CommonJS build and gets bundled; a spelling
 * this rewrite misses fails the build instead of shipping a binary without its driver.
 */
const bundleDrivers: Bun.BunPlugin = {
  name: 'bundle-drivers',
  setup: (build) => {
    build.onLoad({ filter: CONNECTION_SOURCE }, async ({ path: file }) => {
      const source = await Bun.file(file).text()
      const contents = source
        .replace('const require = createRequire(import.meta.url)', '')
        .replaceAll('createRequire(import.meta.url)(', 'require(')
      if (contents.includes('createRequire(')) {
        throw new Error(`${file}: a createRequire the build cannot bundle.`)
      }
      return { contents, loader: 'ts' }
    })
  },
}

const { values } = parseArgs({
  options: { all: { type: 'boolean' }, target: { type: 'string' } },
})
const requested =
  values.target ??
  `${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`
if (!values.all && !isTarget(requested)) {
  throw new Error(
    `Unknown target ${requested}. Pick one of: ${Object.keys(TARGETS).join(', ')}.`
  )
}
const targets = Object.keys(TARGETS)
  .filter(isTarget)
  .filter((target) => values.all || target === requested)

fs.rmSync(DIST, { force: true, recursive: true })
await Promise.all(
  targets.map(async (target) => {
    const outfile = path.join(
      DIST,
      `tamery-${target}${path.extname(getBinaryName(target))}`
    )
    const result = await Bun.build({
      compile: {
        autoloadBunfig: false,
        autoloadDotenv: false,
        outfile,
        target: TARGETS[target],
      },
      define: {
        'import.meta.env.API_URL': JSON.stringify(env.API_URL),
        'import.meta.env.DUCKDB_PACKAGES': JSON.stringify(
          JSON.stringify(await getDuckdbPackages(target))
        ),
        'import.meta.env.MAIN_URL': JSON.stringify(env.MAIN_URL),
        'import.meta.env.WEB_URL': JSON.stringify(env.WEB_URL),
      },
      entrypoints: [path.join(import.meta.dirname, '..', 'src', 'index.ts')],
      // ssh2 loads these native addons inside a try and runs on pure JS without them; bundled, an unbuilt one fails the build.
      // DuckDB's driver is tens of megabytes per platform, so the bridge downloads it on its first DuckDB file.
      external: ['cpu-features', '*.node', '@duckdb/node-api'],
      minify: true,
      plugins: [bundleDrivers],
    })
    if (!result.success) {
      throw new Error(`${target}: ${result.logs.join('\n')}`)
    }
    console.log(`Built ${path.relative(process.cwd(), outfile)}`)
  })
)
