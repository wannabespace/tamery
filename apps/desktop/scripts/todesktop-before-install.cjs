const { rm, writeFile } = require('node:fs/promises')
const path = require('node:path')

// Runs on ToDesktop's build servers right before `pnpm install`. By this point
// the CLI has already resolved every `catalog:` reference from the root
// pnpm-workspace.yaml into a concrete version, so versions are read straight off
// pkgJson rather than duplicated here. Add/remove a runtime dependency in
// package.json and it flows through automatically.
module.exports = async function toDesktopBeforeInstall({
  pkgJsonPath,
  pkgJson,
  appDir,
}) {
  // Treat the app as a standalone single-package workspace so install doesn't
  // try to reach back into the monorepo root (which isn't uploaded). electron
  // is the only allowed build — its install script must run to fetch the binary.
  // pnpm fails the install on any build script left unlisted, so every runtime
  // dependency with one is listed here; keep in sync with the root allowBuilds.
  //
  // cpu-features stays uninstalled: Electron Builder rebuilds every binding.gyp
  // whatever allowBuilds says, and this one only builds after its own install
  // script. ssh2 loads it optionally.
  //
  // nodeLinker: hoisted forces a flat, npm-style node_modules. pnpm's default
  // symlinked layout breaks once packed into app.asar: Node's ESM resolver
  // can't follow the symlinks to find transitive deps (e.g. electron-store's
  // `conf`), throwing ERR_MODULE_NOT_FOUND at runtime. A flat tree resolves
  // every dependency by plain directory lookup, which asar handles correctly.
  //
  // supportedArchitectures: native prebuilds (@napi-rs/keyring) install per CPU,
  // so a Mac build for the other arch, or universal, would ship without its binary.
  await writeFile(
    path.join(appDir, 'pnpm-workspace.yaml'),
    `packages:
  - .
nodeLinker: hoisted
supportedArchitectures:
  os: [current]
  cpu: [x64, arm64]
ignoredOptionalDependencies:
  - cpu-features
allowBuilds:
  electron: true
  oracledb: false
  ssh2: false
`
  )

  // The renderer and main process are already compiled into dist-electron, so
  // the workspace packages the CLI copied into bundledPackages aren't needed.
  await rm(path.join(appDir, 'bundledPackages'), {
    force: true,
    recursive: true,
  })

  const unresolved = Object.entries(pkgJson.dependencies ?? {})
    .filter(
      ([, spec]) => typeof spec === 'string' && spec.startsWith('catalog:')
    )
    .map(([name]) => name)

  if (unresolved.length > 0) {
    throw new Error(
      `Expected the ToDesktop CLI to resolve catalog: versions before this hook, but these are still unresolved: ${unresolved.join(', ')}`
    )
  }

  // Only electron is required at package time. Drop the rest of devDependencies
  // (build tooling + workspace packages that pointed at the removed bundledPackages).
  const electron = pkgJson.devDependencies?.electron
  pkgJson.devDependencies = electron ? { electron } : {}

  delete pkgJson.optionalDependencies
  delete pkgJson.peerDependencies

  await writeFile(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`)
}
