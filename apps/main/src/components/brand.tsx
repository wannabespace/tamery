import { AppLogo } from '@tamery/ui/components/brand/app-logo'
import { cn } from '@tamery/ui/lib/utils'
import type { LinkProps } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'

const SIZES = {
  default: { link: 'gap-2 text-base', logo: 'size-5' },
  lg: { link: 'gap-3 text-3xl', logo: 'size-8' },
}

export const Brand = ({
  size = 'default',
  to,
}: {
  size?: keyof typeof SIZES
  to: LinkProps['to']
}) => (
  <Link
    to={to}
    className={cn(
      'text-foreground flex items-center font-semibold tracking-tight',
      SIZES[size].link
    )}
  >
    <AppLogo
      className={cn('text-primary', SIZES[size].logo)}
      aria-hidden="true"
    />
    Tamery
  </Link>
)
