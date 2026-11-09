import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { env } from '../src/env'
import { getBinaryName, isTarget, TARGETS } from './targets'

const DIST = path.join(import.meta.dirname, '..', 'dist')
const CONNECTION_SOURCE = /packages\/connection\/.+\.ts$/u

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
        'import.meta.env.MAIN_URL': JSON.stringify(env.MAIN_URL),
        'import.meta.env.POSTHOG_TOKEN': JSON.stringify(
          env.POSTHOG_TOKEN ?? ''
        ),
        'import.meta.env.WEB_URL': JSON.stringify(env.WEB_URL),
      },
      entrypoints: [path.join(import.meta.dirname, '..', 'src', 'index.ts')],
      // ssh2 loads these native addons inside a try and runs on pure JS without them; bundled, an unbuilt one fails the build.
      external: ['cpu-features', '*.node'],
      minify: true,
      plugins: [bundleDrivers],
    })
    if (!result.success) {
      throw new Error(`${target}: ${result.logs.join('\n')}`)
    }
    console.log(`Built ${path.relative(process.cwd(), outfile)}`)
  })
)
