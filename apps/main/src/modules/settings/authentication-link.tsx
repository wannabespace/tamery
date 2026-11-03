import { SquareLock02Icon } from '@hugeicons/core-free-icons'

import { SidebarLink } from '~/components/sidebar-button'

export const AuthenticationLink = () => (
  <SidebarLink to="/account/authentication" icon={SquareLock02Icon}>
    Authentication
  </SidebarLink>
)
