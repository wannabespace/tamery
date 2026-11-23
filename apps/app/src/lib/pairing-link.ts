import { MACHINE_PAIR_PATH } from '@tamery/shared/machine'

// Read when the entry imports it, before the router or PostHog reads `location`: the URL names a computer on the user's network.
export const pairingLink =
  location.pathname === MACHINE_PAIR_PATH
    ? new URLSearchParams(location.hash.slice(1)).get('url')
    : null

if (pairingLink !== null) {
  history.replaceState(history.state, '', MACHINE_PAIR_PATH + location.search)
}
