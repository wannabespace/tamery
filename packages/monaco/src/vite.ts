import type { Plugin } from 'vite'

const MONACO_ENTRY = /[/\\]monaco-editor[/\\]esm[/\\]vs[/\\]index\.js$/u
const UNUSED_LANGUAGE =
  /^\.\/languages\/(?:features\/(?:css|html|typescript)|definitions\/(?!xml\/)[^/]+)\/register\.js$/u
const NO_LANGUAGE = '\0tamery-monaco-no-language'

// Drops every stock Monaco language but JSON and XML: an editor that needs another one must be allowed here first.
// Add it to optimizeDeps too, or dev keeps languages that production drops.
export const dropUnusedMonacoLanguages = (): Plugin => ({
  enforce: 'pre',
  load: (id) => (id === NO_LANGUAGE ? 'export {}' : null),
  name: 'tamery:drop-unused-monaco-languages',
  resolveId: (source, importer) =>
    importer && MONACO_ENTRY.test(importer) && UNUSED_LANGUAGE.test(source)
      ? NO_LANGUAGE
      : null,
})
