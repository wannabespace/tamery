import { MACHINE_PAIR_PATH } from '@tamery/shared/machine'

// Older CLIs open `/settings/machines#url=…`, which names a computer on the user's network: dropped before the router or PostHog reads `location`.
if (
  location.pathname === MACHINE_PAIR_PATH &&
  location.hash.startsWith('#url=')
) {
  history.replaceState(history.state, '', MACHINE_PAIR_PATH + location.search)
}
