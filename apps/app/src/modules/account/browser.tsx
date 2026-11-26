import { LinkSquare02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { posthog } from '~/lib/posthog'

type SocialProvider = 'github' | 'google'

/**
 * Desktop only: opens Settings → Security in the web app in the system browser, which starts linking `connect` itself.
 * A passkey needs a real browser origin, and OAuth checks its state cookie in the browser that finishes the flow, so neither can start here.
 */
export const inBrowser = window.electron
  ? (connect?: SocialProvider) => {
      posthog.capture('security_opened_in_browser')
      window.open(
        `${import.meta.env.VITE_PUBLIC_WEB_URL}/settings/security${connect ? `?connect=${connect}` : ''}`
      )
    }
  : null

export const BrowserMark = () =>
  inBrowser && (
    <HugeiconsIcon
      icon={LinkSquare02Icon}
      strokeWidth={2}
      data-icon="inline-end"
    />
  )

// The desktop app's Stripe pages open in the system browser, so they return to the site's /open, which hands back to the app.
export const stripeReturnUrl = (section: string) =>
  window.electron
    ? `${import.meta.env.VITE_PUBLIC_MAIN_URL}/open?type=desktop`
    : `${location.origin}/settings/${section}`

export const openStripe = ({ url }: { url: string }) => {
  if (window.electron) {
    window.open(url)
  } else {
    location.assign(url)
  }
}
