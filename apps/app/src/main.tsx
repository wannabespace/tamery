import './lib/warmup'
import { themeStore } from '@tamery/ui/theme-store'
import { createRouter, Navigate, RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { toast } from 'sonner'

import { history, lastLocationStorageValue } from './lib/last-location'
import { posthog } from './lib/posthog'
import { transparentBackgroundValue } from './lib/transparent-background'
import { routeTree } from './routeTree.gen'

if (window.electron) {
  themeStore.subscribe((theme) => window.electron?.app.setNativeTheme(theme), {
    immediate: true,
  })
}

transparentBackgroundValue.subscribe((isTransparent) =>
  document.documentElement.classList.toggle('opaque', !isTransparent)
)

window.electron?.app.onSendToast(({ message, type, description, duration }) => {
  toast[type](message, {
    description,
    duration,
    id: `${type}-${message}-${description}`,
    position: 'bottom-center',
  })
})

if (window.electron) {
  window.addEventListener('keydown', (event) => {
    if (
      ((event.ctrlKey || event.metaKey) && event.key === 'r') ||
      event.key === 'F5'
    ) {
      event.preventDefault()
    }
  })
}

export const router = createRouter({
  defaultNotFoundComponent: () => <Navigate replace to="/" />,
  defaultPendingMinMs: 0,
  defaultPreload: 'intent',
  history,
  pathParamsAllowedCharacters: [':'],
  routeTree,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

router.subscribe('onResolved', ({ fromLocation, toLocation }) => {
  if (fromLocation?.pathname !== toLocation.pathname) {
    posthog.capture('$pageview')
  }

  for (const shell of document.querySelectorAll('[data-shell]')) {
    requestAnimationFrame(() => shell.remove())
  }

  if (!toLocation.pathname.startsWith('/auth')) {
    lastLocationStorageValue.set(toLocation.href)
  }
})

const isRoutableHref = (href: string) => {
  const { pathname } = new URL(href, window.location.origin)

  return !router.matchRoutes(pathname).some((match) => match._notFound)
}

if (router.state.location.pathname === '/') {
  const lastLocation = lastLocationStorageValue.get()

  if (lastLocation && isRoutableHref(lastLocation)) {
    router.navigate({ href: lastLocation, replace: true })
  } else {
    lastLocationStorageValue.clear()
    router.navigate({ replace: true, to: '/auth' })
  }
}

const rootElement = document.querySelector('#root')
if (!rootElement) {
  throw new Error('Root element #root not found')
}

const root = createRoot(rootElement)

root.render(<RouterProvider router={router} />)
