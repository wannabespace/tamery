interface ImportMetaEnv {
  readonly API_URL: string
  readonly MAIN_URL: string
  readonly WEB_URL: string
  /** Only a built binary has one. */
  readonly VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
