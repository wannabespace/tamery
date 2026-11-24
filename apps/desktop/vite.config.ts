import process from 'node:process'

import { setupPortlessEnvs } from '@tamery/shared/portless-env'
import type { InlineConfig } from 'vite'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'

import packageJson from './package.json' with { type: 'json' }

setupPortlessEnvs({
  API_URL: 'api.local.tamery',
  MAIN_URL: 'main.local.tamery',
  WEB_URL: 'app.local.tamery',
})

// The machine process runs the CLI's machine, which reads these where the CLI's build inlines them.
const machineEnv = {
  API_URL: process.env.VITE_PUBLIC_API_URL ?? process.env.API_URL,
  MAIN_URL: process.env.VITE_PUBLIC_MAIN_URL ?? process.env.MAIN_URL,
  WEB_URL: process.env.VITE_PUBLIC_WEB_URL ?? process.env.WEB_URL,
}

const rolldownOptions: NonNullable<
  NonNullable<InlineConfig['build']>['rolldownOptions']
> = {
  external: [
    ...Object.keys(packageJson.dependencies),
    ...Object.keys(packageJson.devDependencies),
  ].filter((dep) => !dep.startsWith('@tamery/')),
  output: {
    format: 'es',
    keepNames: true,
  },
}

export default defineConfig(({ command, mode }) => ({
  build: {
    rolldownOptions,
  },
  plugins: [
    electron({
      main: {
        entry: ['src/main/main.ts', 'src/main/query.ts', 'src/main/machine.ts'],
        vite: {
          build: {
            minify: false,
            rolldownOptions,
          },
          define: Object.fromEntries(
            Object.entries(machineEnv).map(([name, value]) => {
              if (value) {
                return [`import.meta.env.${name}`, JSON.stringify(value)]
              }
              if (command === 'build' && mode === 'production') {
                throw new Error(
                  `Set VITE_PUBLIC_${name}: a production build inlines the machine's service URLs.`
                )
              }
              // Unset in dev without portless, the process reads it when it runs, as `bun` does.
              return [`import.meta.env.${name}`, `process.env.${name}`]
            })
          ),
        },
      },
      preload: {
        input: 'src/preload/preload.ts',
        vite: {
          build: {
            minify: false,
            rolldownOptions,
          },
        },
      },
    }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
}))
