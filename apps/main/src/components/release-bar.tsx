import { ArrowRight02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'

import { useLatestVersion } from '~/hooks/use-latest-version'

export const ReleaseBar = () => {
  const version = useLatestVersion()

  if (!version) {
    return null
  }

  return (
    <Link
      to="/releases"
      className="bg-muted text-foreground group flex h-10 items-center justify-center gap-1.5 px-4 text-sm"
    >
      Tamery {version} is out
      <span className="text-muted-foreground group-hover:text-foreground transition-colors">
        See what’s new
      </span>
      <HugeiconsIcon
        icon={ArrowRight02Icon}
        strokeWidth={2}
        className="ease-house size-3.5 transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  )
}
