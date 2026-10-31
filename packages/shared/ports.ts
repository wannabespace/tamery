export const PORTS = {
  LOCAL_PROXY: 26_380,
  MCP: 26_381,
} as const

/** `tamery proxy` listens here only: `localhost` may resolve to `::1`, where any other process can listen. */
export const LOCAL_PROXY_URL = `http://127.0.0.1:${PORTS.LOCAL_PROXY}`

/** A website rebinding its own domain to 127.0.0.1 arrives with its own Host. */
export const LOOPBACK_HOST = /^(?:127\.0\.0\.1|localhost)(?::\d+)?$/u
