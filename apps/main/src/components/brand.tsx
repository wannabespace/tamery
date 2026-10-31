import { AppLogo } from '@tamery/ui/components/brand/app-logo'
import type { LinkProps } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'

export const Brand = ({ to }: { to: LinkProps['to'] }) => (
  <Link
    to={to}
    className="text-foreground flex items-center gap-2 text-base font-semibold tracking-tight"
  >
    <AppLogo className="text-primary size-5" aria-hidden="true" />
    Tamery
  </Link>
)
