import fs from 'node:fs'
import path from 'node:path'

import pkg from '../package.json' with { type: 'json' }
import { getBinaryName, isTarget, TARGETS } from './targets'

const ROOT = path.join(import.meta.dirname, '..')
const DIST = path.join(ROOT, 'dist')
const OUT = path.join(DIST, 'npm')

const targets = Object.keys(TARGETS).filter(isTarget)

const shared = {
  author: pkg.author,
  bugs: pkg.bugs,
  homepage: 'https://docs.tamery.app/cli',
  repository: pkg.repository,
  version: pkg.version,
}

const LICENSE = path.join(ROOT, '..', '..', 'LICENSE')

/** `copyFileSync` keeps each binary's executable mode, which npm only sets itself for `bin` entries. */
const writePackage = (
  name: string,
  manifest: object,
  files: Record<string, string>
) => {
  const dir = path.join(OUT, name)
  for (const [to, from] of Object.entries({ LICENSE, ...files })) {
    fs.mkdirSync(path.dirname(path.join(dir, to)), { recursive: true })
    fs.copyFileSync(from, path.join(dir, to))
  }
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({ name, ...shared, ...manifest }, null, 2)}\n`
  )
  console.log(`Packed ${path.relative(process.cwd(), dir)}`)
}

fs.rmSync(OUT, { force: true, recursive: true })

for (const target of targets) {
  const [os, cpu, libc] = target.split('-')
  const binary = getBinaryName(target)
  writePackage(
    `tamery-${target}`,
    {
      cpu: [cpu],
      description: `The Tamery CLI binary for ${target}. Install \`tamery\` instead.`,
      files: ['bin', 'LICENSE'],
      os: [os === 'windows' ? 'win32' : os],
      ...(os === 'linux' && { libc: [libc ?? 'glibc'] }),
    },
    {
      [`bin/${binary}`]: path.join(
        DIST,
        `tamery-${target}${path.extname(binary)}`
      ),
    }
  )
}

writePackage(
  'tamery',
  {
    bin: { tamery: 'tamery.js' },
    description: pkg.description,
    engines: { node: '>=18' },
    files: ['tamery.js', 'LICENSE', 'README.md'],
    keywords: pkg.keywords,
    optionalDependencies: Object.fromEntries(
      targets.map((target) => [`tamery-${target}`, pkg.version])
    ),
    type: 'module',
  },
  {
    'README.md': path.join(ROOT, 'README.md'),
    'tamery.js': path.join(ROOT, 'npm', 'tamery.js'),
  }
)
