const ACCOUNT_PAGES = { ai: 'credits', plan: 'billing' } as const

// The API takes billing returns only on the site's /account pages, which send the browser back to Settings. A desktop app's Stripe page opens in the system browser, as does Settings when an installed app's account link (`?type=desktop`) opened it, so it returns through /open, which hands back to the app.
export const stripeReturnUrl = (section: keyof typeof ACCOUNT_PAGES) =>
  window.electron ||
  new URLSearchParams(location.search).get('type') === 'desktop'
    ? `${import.meta.env.VITE_PUBLIC_MAIN_URL}/account/billing?type=desktop&subscription=done`
    : `${import.meta.env.VITE_PUBLIC_MAIN_URL}/account/${ACCOUNT_PAGES[section]}`

export const openStripe = ({ url }: { url: string }) => {
  if (window.electron) {
    window.open(url)
  } else {
    location.assign(url)
  }
}
