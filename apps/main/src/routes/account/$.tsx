import { createFileRoute, redirect } from '@tanstack/react-router'

// Emails already sent and older apps still link to the account area that moved into the app's Settings.
const SECTIONS: Partial<Record<string, string>> = {
  authentication: 'security',
  billing: 'plan',
  credits: 'ai',
  settings: 'account',
}

export const Route = createFileRoute('/account/$')({
  beforeLoad: ({ params }) => {
    throw redirect({
      href: `${import.meta.env.VITE_PUBLIC_WEB_URL}/settings/${SECTIONS[params._splat ?? ''] ?? 'plan'}`,
    })
  },
})
