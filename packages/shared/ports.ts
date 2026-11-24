export const PORTS = {
  /** Beside `MACHINE`, so `tamery machine` and the desktop app can both serve one computer. */
  DESKTOP_MACHINE: 26_382,
  MACHINE: 26_380,
  MCP: 26_381,
} as const

/** A website rebinding its own domain to 127.0.0.1 arrives with its own Host. */
export const LOOPBACK_HOST = /^(?:127\.0\.0\.1|localhost)(?::\d+)?$/u
