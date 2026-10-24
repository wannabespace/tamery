import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Layers01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { uppercaseFirst } from '@tamery/shared/utils'
import { SidebarMenuButton } from '@tamery/ui/components/sidebar'
import { AnimatePresence, motion } from 'motion/react'
import { useSubscription } from 'seitu/react'

import { useObjectNames } from '~/core/catalog/names'
import { useConnectionContext } from '~/core/connection/route'

import { getNavigatorStore } from './stores'

const TRANSITION = { duration: 0.15, ease: [0.32, 0.72, 0, 1] } as const

export const NavigatorSwitcher = () => {
  const { connectionResource } = useConnectionContext()
  const navigatorStore = getNavigatorStore(connectionResource.id)
  const navigator = useSubscription(navigatorStore)
  const isDefinitions = navigator === 'definitions'
  const names = useObjectNames()

  return (
    <SidebarMenuButton
      aria-label={isDefinitions ? `Back to ${names.table}s` : 'Open schema'}
      onClick={() =>
        navigatorStore.set(isDefinitions ? 'tables' : 'definitions')
      }
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={navigator}
          initial={{ opacity: 0, x: isDefinitions ? 6 : -6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: isDefinitions ? -6 : 6 }}
          transition={TRANSITION}
          className="flex w-full items-center gap-2"
        >
          {isDefinitions ? (
            <>
              <HugeiconsIcon
                icon={ArrowLeft01Icon}
                strokeWidth={2}
                className="text-muted-foreground"
              />
              {uppercaseFirst(names.table)}s
            </>
          ) : (
            <>
              <HugeiconsIcon
                icon={Layers01Icon}
                strokeWidth={2}
                className="text-muted-foreground"
              />
              Schema
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                className="text-muted-foreground/60 ml-auto size-3.5!"
              />
            </>
          )}
        </motion.span>
      </AnimatePresence>
    </SidebarMenuButton>
  )
}
