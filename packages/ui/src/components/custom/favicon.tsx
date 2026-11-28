import { GlobeIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@tamery/ui/lib/utils'
import { useState } from 'react'

/** A site's icon by its host, a globe when the site has none. */
export const Favicon = ({
  className,
  host,
}: {
  className?: string
  host: string
}) => {
  const [failed, setFailed] = useState(false)
  return failed ? (
    <HugeiconsIcon
      icon={GlobeIcon}
      strokeWidth={2}
      className={cn('text-muted-foreground', className)}
    />
  ) : (
    <img
      alt=""
      src={`https://icons.duckduckgo.com/ip3/${host}.ico`}
      className={cn('ring-foreground/10 rounded-sm ring', className)}
      onError={() => setFailed(true)}
    />
  )
}
