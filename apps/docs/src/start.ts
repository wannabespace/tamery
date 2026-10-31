import { getTrailingSlashRedirect } from '@tamery/shared/trailing-slash'
import { createMiddleware, createStart } from '@tanstack/react-start'

const trailingSlashMiddleware = createMiddleware().server(
  ({ next, request }) => getTrailingSlashRedirect(request) ?? next()
)

export const startInstance = createStart(() => ({
  requestMiddleware: [trailingSlashMiddleware],
}))
