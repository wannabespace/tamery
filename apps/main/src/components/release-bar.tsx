import { ArrowRight02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { orpc } from '~/lib/orpc'

export const ReleaseBar = () => {
  const { data: releases } = useQuery(orpc.releases.queryOptions())
  const latest = releases?.[0]

  if (!latest) {
    return null
  }

  return (
    <Link
      to="/releases"
      className="bg-muted text-foreground group flex h-10 items-center justify-center gap-1.5 px-4 text-sm"
    >
      Tamery {latest.name || latest.tagName} is out
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
