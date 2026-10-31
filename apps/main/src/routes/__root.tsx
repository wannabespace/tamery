import { SOCIAL_LINKS } from '@tamery/shared/constants'
import { Toaster } from '@tamery/ui/components/sonner'
import { TooltipProvider } from '@tamery/ui/components/tooltip'
import { ThemeObserver } from '@tamery/ui/theme-observer'
import type { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouteContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { MotionConfig } from 'motion/react'
import { useEffect } from 'react'
import type { Graph } from 'schema-dts'

import { SEO } from '~/constants'
import { ErrorPage } from '~/error-page'
import { authClient, sessionQueryOptions } from '~/lib/auth'
import { posthog } from '~/lib/posthog'
import { NotFoundPage } from '~/not-found-page'
import { SITE_URL } from '~/utils/seo'

import appCss from '@tamery/ui/globals.css?url'

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'Tamery',
      url: `${SITE_URL}/`,
      publisher: { '@id': `${SITE_URL}/#org` },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#app`,
      name: 'Tamery',
      url: SITE_URL,
      image: `${SITE_URL}/og-image.png`,
      description: SEO.description,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'macOS, Windows, Linux',
      downloadUrl: `${SITE_URL}/download`,
      license: 'https://www.gnu.org/licenses/agpl-3.0.html',
      publisher: { '@id': `${SITE_URL}/#org` },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      sameAs: [SOCIAL_LINKS.GITHUB, SOCIAL_LINKS.TWITTER, SOCIAL_LINKS.DISCORD],
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#org`,
      name: 'Tamery',
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
      sameAs: [SOCIAL_LINKS.GITHUB, SOCIAL_LINKS.TWITTER, SOCIAL_LINKS.DISCORD],
    },
  ],
} satisfies Graph

const analyticsScripts = [
  {
    defer: true,
    src: 'https://assets.onedollarstats.com/stonks.js',
  },
  {
    defer: true,
    src: 'https://datafa.st/js/script.js',
    'data-website-id': 'dfid_vIscqqXu4BxAFu9ObaBYl',
    'data-domain': 'tamery.app',
  },
]

const RootComponent = () => {
  const { session } = useRouteContext({ from: '__root__' })

  useEffect(() => {
    void posthog.start()
  }, [])

  useEffect(() => {
    authClient.hydrateSession(session)
  }, [session])

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-body relative">
        <MotionConfig reducedMotion="user">
          <TooltipProvider>
            <ThemeObserver />
            <Outlet />
          </TooltipProvider>
        </MotionConfig>
        <ReactQueryDevtools buttonPosition="bottom-left" />
        <Toaster />
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  )
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  beforeLoad: async ({ context }) => {
    const { data } = await context.queryClient.fetchQuery(sessionQueryOptions)

    return { session: data }
  },
  // Every tag here shows on pages without their own `seo()` (auth, account, 404), so nothing page-specific belongs in it.
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Tamery' },
      { name: 'apple-mobile-web-app-title', content: 'Tamery' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'icon',
        type: 'image/png',
        href: '/favicon-96x96.png',
        sizes: '96x96',
      },
      { rel: 'shortcut icon', href: '/favicon.ico' },
      {
        rel: 'apple-touch-icon',
        href: '/apple-touch-icon.png',
        sizes: '180x180',
      },
      { rel: 'manifest', href: '/site.webmanifest' },
    ],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify(structuredData),
      },
      ...(import.meta.env.DEV ? [] : analyticsScripts),
    ],
  }),
  component: RootComponent,
  errorComponent: (props) => <ErrorPage {...props} />,
  notFoundComponent: NotFoundPage,
})
