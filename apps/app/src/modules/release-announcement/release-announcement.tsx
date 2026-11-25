import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { MotionCollapse } from '@tamery/ui/components/collapse.motion'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemLink,
  ItemTitle,
} from '@tamery/ui/components/item'
import { useQuery } from '@tanstack/react-query'
import { type } from 'arktype'
import { AnimatePresence } from 'motion/react'
import { useSubscription } from 'seitu/react'
import { createWebStorageValue } from 'seitu/web'

import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'

const version = import.meta.env.VITE_APP_VERSION

const dismissedVersions = createWebStorageValue({
  defaultValue: [],
  key: 'release-announcement-dismissed',
  schema: type('string[]'),
  type: 'localStorage',
})

const dismiss = (
  event: 'release_announcement_opened' | 'release_announcement_dismissed'
) => {
  posthog.capture(event)
  dismissedVersions.set((versions) => [...versions, version])
}

export const ReleaseAnnouncement = () => {
  const dismissed = useSubscription(dismissedVersions).includes(version)
  const { data: announcement } = useQuery(
    orpc.releases.queryOptions({
      context: { silent: true },
      enabled: !dismissed,
      select: (releases) =>
        releases.find((release) => release.tagName === `v${version}`)
          ?.announcement ?? null,
      staleTime: 10 * 60 * 1000,
    })
  )

  return (
    <AnimatePresence initial={false}>
      {announcement && !dismissed && (
        <MotionCollapse className="shrink-0">
          <div className="pt-1.5 pl-2">
            <Item variant="card" size="xs">
              <ItemHeader className="[@media(max-height:40rem)]:hidden">
                <img
                  src={announcement.image}
                  alt=""
                  draggable={false}
                  referrerPolicy="no-referrer"
                  className="bg-muted aspect-video w-full rounded-md object-cover"
                />
              </ItemHeader>
              <ItemContent className="min-w-0">
                <ItemTitle>
                  <ItemLink
                    href={`${import.meta.env.VITE_PUBLIC_MAIN_URL}/releases#v${version}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => dismiss('release_announcement_opened')}
                    onAuxClick={(event) =>
                      event.button === 1 &&
                      dismiss('release_announcement_opened')
                    }
                  >
                    Tamery {version}
                  </ItemLink>
                </ItemTitle>
                {announcement.summary && (
                  <ItemDescription>{announcement.summary}</ItemDescription>
                )}
              </ItemContent>
              <ItemActions className="relative self-start">
                <IconButton
                  icon={Cancel01Icon}
                  label="Dismiss"
                  size="icon-xs"
                  variant="ghost-muted"
                  onClick={() => dismiss('release_announcement_dismissed')}
                />
              </ItemActions>
            </Item>
          </div>
        </MotionCollapse>
      )}
    </AnimatePresence>
  )
}
