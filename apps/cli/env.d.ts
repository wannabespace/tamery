interface ImportMetaEnv {
  readonly API_URL: string
  readonly MAIN_URL: string
  readonly POSTHOG_TOKEN: string | undefined
  readonly WEB_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
