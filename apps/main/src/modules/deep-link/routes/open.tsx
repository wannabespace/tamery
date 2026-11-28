import { Button } from '@tamery/ui/components/button'
import {
  createFileRoute,
  getRouteApi,
  Link,
  redirect,
} from '@tanstack/react-router'
import { type } from 'arktype'
import { useEffect } from 'react'

import { authClient } from '~/lib/auth'

import { OpenStatus } from '../open-status'

const { useLoaderData, useSearch } = getRouteApi('/open')

const getOpenMessage = (clientType: 'web' | 'desktop' | 'cli' | undefined) => {
  if (clientType === 'cli') {
    return 'You can close this tab and return to the Tamery CLI.'
  }
  if (clientType === 'desktop') {
    return 'You can open the desktop app and leave this page.'
  }
  return 'You can continue in Tamery or close this page.'
}

const OpenPage = () => {
  const { signedIn } = useLoaderData()
  const { type: clientType } = useSearch()

  useEffect(() => {
    if (clientType === 'desktop') {
      location.assign('tamery://')
    }
  }, [clientType])

  return (
    <OpenStatus title="Opening Tamery" description={getOpenMessage(clientType)}>
      <Button
        variant="outline"
        render={
          signedIn ? (
            <a
              href={import.meta.env.VITE_PUBLIC_WEB_URL}
              aria-label="Open web app"
            />
          ) : (
            <Link to="/sign-in" />
          )
        }
      >
        {signedIn ? 'Open web app' : 'Sign in'}
      </Button>
    </OpenStatus>
  )
}

export const Route = createFileRoute('/open')({
  component: OpenPage,
  validateSearch: type({
    'type?': '"web" | "desktop" | "cli"',
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const { type: clientType } = deps

    const { data } = await authClient.getSession()

    if (clientType === 'web' && data?.user) {
      throw redirect({ href: import.meta.env.VITE_PUBLIC_WEB_URL })
    }

    return { signedIn: !!data }
  },
})
