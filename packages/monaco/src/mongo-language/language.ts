import { languages } from 'monaco-editor'
import {
  conf,
  language,
} from 'monaco-editor/languages/definitions/javascript/javascript.js'

export const registerMongoTokens = (id: string) => {
  languages.register({ id })

  const configuration = languages.setLanguageConfiguration(id, conf)
  const tokens = languages.setMonarchTokensProvider(id, {
    ...language,
    // mongosh is JavaScript; it only adds `$`-prefixed operators, which JS would read as plain identifiers.
    defaultToken: '',
    tokenizer: {
      ...language.tokenizer,
      root: [[/\$[\w$]+/u, 'keyword'], ...language.tokenizer.root],
    },
  })

  return [configuration, tokens]
}
