import { ArrowRight02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DOCS_URL } from '@tamery/shared/constants'
import { cn } from '@tamery/ui/lib/utils'

import { posthog } from '~/lib/posthog'

export const DocsLink = ({
  children,
  className,
  path,
  source,
}: {
  children: string
  className?: string
  path: string
  source: string
}) => (
  <a
    href={`${DOCS_URL}${path}`}
    onClick={() => posthog.capture('docs_opened', { source })}
    className={cn(
      'text-foreground group/docs-link inline-flex items-center gap-1 text-sm',
      className
    )}
  >
    {children}
    <HugeiconsIcon
      icon={ArrowRight02Icon}
      strokeWidth={2}
      className="ease-house size-3.5 transition-transform group-hover/docs-link:translate-x-0.5"
    />
  </a>
)
