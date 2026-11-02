import { BRIDGE_PAIR_PATH } from '@tamery/shared/bridge'

// Read when the entry imports it, before the router or PostHog reads `location`: the URL names a computer on the user's network.
export const pairingLink =
  location.pathname === BRIDGE_PAIR_PATH
    ? new URLSearchParams(location.hash.slice(1)).get('url')
    : null

if (pairingLink !== null) {
  history.replaceState(history.state, '', BRIDGE_PAIR_PATH + location.search)
}
