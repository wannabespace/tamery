import '@tamery/shared/arktype-config'

// Keep every other module behind a dynamic import: a static one that reaches arktype runs before configure() in the production bundle, which dev does not show.
await import('./lib/pairing-link')
await import('./main')
