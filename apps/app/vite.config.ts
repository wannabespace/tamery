import posthog from '@posthog/rollup-plugin'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { setupPortlessEnvs } from '@tamery/shared/portless-env'
import { POSTHOG_API_HOST, POSTHOG_UI_HOST } from '@tamery/shared/posthog'
import { inlineHtml } from '@tamery/vite-inline-html'
import { inlineReactHtml } from '@tamery/vite-inline-html/react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import packageJson from '../desktop/package.json' with { type: 'json' }

setupPortlessEnvs({
  VITE_PUBLIC_API_URL: 'api.local.tamery',
  VITE_PUBLIC_MAIN_URL: 'main.local.tamery',
  VITE_PUBLIC_PROXY_URL: 'proxy.local.tamery',
  VITE_PUBLIC_SHARE_URL: 'share.local.tamery',
  VITE_PUBLIC_WEB_URL: 'app.local.tamery',
})
process.env.VITE_POSTHOG_API_HOST = POSTHOG_API_HOST

export default defineConfig(({ mode }) => ({
  base: mode === 'desktop' ? './' : '/',
  build: {
    outDir: mode === 'desktop' ? 'dist-desktop' : 'dist',
    rolldownOptions: {
      output: {
        keepNames: true,
      },
    },
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version),
    'import.meta.env.VITE_TEST': mode === 'test',
  },
  plugins: [
    tailwindcss(),
    tanstackRouter({
      autoCodeSplitting: true,
      codeSplittingOptions: {
        defaultBehavior: [
          ['loader'],
          ['component'],
          ['pendingComponent'],
          ['errorComponent'],
          ['notFoundComponent'],
        ],
      },
      generatedRouteTree: 'src/routeTree.gen.ts',
      routesDirectory: 'src/routes',
    }),
    inlineHtml({
      cspMarker: '%INLINE_SCRIPT_CSP%',
      scripts: [{ entry: 'src/boot.ts', marker: '<!--boot-->' }],
    }),
    inlineReactHtml({
      components: [
        { export: 'Shells', marker: '<!--shell-->', module: '/src/shell.tsx' },
      ],
    }),
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
    process.env.POSTHOG_PERSONAL_API_KEY
      ? posthog({
          host: POSTHOG_UI_HOST,
          personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY,
          projectId: '44940',
          sourcemaps: {
            releaseName: 'tamery-app',
            releaseVersion: packageJson.version,
          },
        })
      : null,
  ],
  resolve: {
    tsconfigPaths: true,
  },
}))
