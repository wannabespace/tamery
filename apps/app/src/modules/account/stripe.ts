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
