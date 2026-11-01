import { BRIDGE_PAIR_PATH } from '@tamery/shared/bridge'

const readLink = () => {
  const params = new URLSearchParams(location.hash.slice(1))
  const code = params.get('code')
  const url = params.get('url')
  if (location.pathname !== BRIDGE_PAIR_PATH || code === null || url === null) {
    return null
  }
  history.replaceState(history.state, '', BRIDGE_PAIR_PATH + location.search)
  return { code, url }
}

export type PairingLink = NonNullable<ReturnType<typeof readLink>>

// Read when the entry imports it, before the router or PostHog reads `location`: the code pairs a computer.
export const pairingLink = readLink()
