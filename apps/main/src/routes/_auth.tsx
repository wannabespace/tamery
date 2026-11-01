import { Button } from '@tamery/ui/components/button'
import { AuthSidePanel } from '@tamery/ui/components/custom/auth-side-panel'
import {
  createFileRoute,
  Link,
  Outlet,
  useMatches,
} from '@tanstack/react-router'
import { type } from 'arktype'

import { Brand } from '~/components/brand'
import { SITE_PATH } from '~/lib/site-path'
import { Consent } from '~/modules/legal/legal-links'

const AuthLayout = () => {
  const match = useMatches({
    select: (matches) => matches.map((routeMatch) => routeMatch.routeId).at(-1),
  })
  const isSignIn = match === '/_auth/sign-in'

  return (
    <div className="bg-background grid min-h-dvh lg:grid-cols-2">
      <AuthSidePanel />
      <main className="flex flex-col px-4 py-3 sm:px-8 sm:py-6">
        <header className="flex h-8 items-center justify-between">
          <div className="lg:invisible">
            <Brand to="/" />
          </div>
          <Button
            variant="ghost-muted"
            size="sm"
            render={isSignIn ? <Link to="/" /> : <Link to="/sign-in" />}
          >
            {isSignIn ? 'Home' : 'Sign in'}
          </Button>
        </header>
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="flex w-full max-w-sm flex-col gap-6">
            <Outlet />
            {isSignIn && <Consent />}
          </div>
        </div>
      </main>
    </div>
  )
}

export const Route = createFileRoute('/_auth')({
  component: AuthLayout,
  head: () => ({
    meta: [
      { title: 'Sign in - Tamery' },
      { content: 'noindex', name: 'robots' },
    ],
  }),
  validateSearch: type({
    'redirectPath?': SITE_PATH,
  }),
})
