import { createMiddleware, createStart } from '@tanstack/react-start'

const TRAILING_SLASHES = /\/+$/u

// The router strips a trailing slash itself, but with a temporary 307 that search engines do not treat as the page's address.
const trailingSlashMiddleware = createMiddleware().server(
  ({ next, request }) => {
    const { pathname, search } = new URL(request.url)
    if (pathname === '/' || !pathname.endsWith('/')) {
      return next()
    }
    return new Response(null, {
      headers: { Location: pathname.replace(TRAILING_SLASHES, '') + search },
      status: 308,
    })
  }
)

export const startInstance = createStart(() => ({
  requestMiddleware: [trailingSlashMiddleware],
}))
