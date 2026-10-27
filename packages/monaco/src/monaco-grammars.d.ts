// monaco-editor ships its language grammars as untyped deep modules under `languages/definitions/*`.
declare module 'monaco-editor/languages/definitions/javascript/javascript.js' {
  import type { languages } from 'monaco-editor'

  export const conf: languages.LanguageConfiguration
  export const language: languages.IMonarchLanguage & {
    tokenizer: { root: languages.IMonarchLanguageRule[] }
  }
}
