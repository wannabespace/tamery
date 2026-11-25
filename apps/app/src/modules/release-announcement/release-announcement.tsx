import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { cardClass } from '@tamery/ui/components/card.utils'
import { MotionCollapse } from '@tamery/ui/components/collapse.motion'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import { cn } from '@tamery/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { type } from 'arktype'
import { AnimatePresence } from 'motion/react'
import { useSubscription } from 'seitu/react'
import { createWebStorageValue } from 'seitu/web'

import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'

const version = import.meta.env.VITE_APP_VERSION

const dismissedVersion = createWebStorageValue({
  defaultValue: null,
  key: 'release-announcement-dismissed',
  schema: type('string | null'),
  type: 'localStorage',
})

export const ReleaseAnnouncement = () => {
  const dismissed = useSubscription(dismissedVersion) === version
  const { data } = useQuery(
    orpc.releaseAnnouncement.queryOptions({
      context: { silent: true },
      enabled: !dismissed,
      input: { version },
      staleTime: Number.POSITIVE_INFINITY,
    })
  )
  const announcement = dismissed ? null : data

  return (
    <AnimatePresence initial={false}>
      {announcement && (
        <MotionCollapse className="shrink-0">
          <div className="pt-1.5 pl-2">
            <div
              className={cn(
                cardClass,
                'hover:ring-foreground/12 has-[a:focus-visible]:focus-ring hover:bg-accent relative flex flex-col gap-2 p-1.5'
              )}
            >
              <img
                src={announcement.image}
                alt=""
                draggable={false}
                className="bg-muted aspect-video w-full rounded-md object-cover"
              />
              <div className="flex items-start gap-1 pb-1 pl-1.5">
                <div className="flex min-w-0 flex-1 flex-col">
                  <a
                    href={`${import.meta.env.VITE_PUBLIC_MAIN_URL}/releases#v${version}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground cursor-default text-sm font-medium outline-none after:absolute after:inset-0"
                    onClick={() => {
                      posthog.capture('release_announcement_opened')
                      dismissedVersion.set(version)
                    }}
                  >
                    Tamery {version}
                  </a>
                  {announcement.summary && (
                    <p className="text-muted-foreground truncate text-xs">
                      {announcement.summary}
                    </p>
                  )}
                </div>
                <IconButton
                  icon={Cancel01Icon}
                  label="Dismiss"
                  size="icon-xs"
                  variant="ghost-muted"
                  className="relative"
                  onClick={() => {
                    posthog.capture('release_announcement_dismissed')
                    dismissedVersion.set(version)
                  }}
                />
              </div>
            </div>
          </div>
        </MotionCollapse>
      )}
    </AnimatePresence>
  )
}
