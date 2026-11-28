import { createFileRoute, redirect } from '@tanstack/react-router'
import { type } from 'arktype'

// Emails already sent and older apps still link to the account area that moved into the app's Settings.
const SECTIONS: Partial<Record<string, string>> = {
  authentication: 'security',
  billing: 'plan',
  credits: 'ai',
  settings: 'account',
}

export const Route = createFileRoute('/account/$')({
  validateSearch: type({
    'subscription?': 'string',
    'type?': 'string',
  }),
  beforeLoad: ({ params, search }) => {
    const fromDesktop = search.type === 'desktop'
    if (fromDesktop && search.subscription) {
      throw redirect({ search: { type: 'desktop' }, to: '/open' })
    }
    throw redirect({
      href: `${import.meta.env.VITE_PUBLIC_WEB_URL}/settings/${SECTIONS[params._splat ?? ''] ?? 'plan'}${fromDesktop ? '?type=desktop' : ''}`,
    })
  },
})
