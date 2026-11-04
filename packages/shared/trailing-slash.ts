const TRAILING_SLASHES = /\/+$/u

// The router strips a trailing slash itself, but with a temporary 307 that search engines do not treat as the page's address.
export const getTrailingSlashRedirect = (request: Request) => {
  const { pathname, search } = new URL(request.url)
  if (pathname === '/' || !pathname.endsWith('/')) {
    return null
  }
  return new Response(null, {
    headers: { Location: pathname.replace(TRAILING_SLASHES, '') + search },
    status: 308,
  })
}
