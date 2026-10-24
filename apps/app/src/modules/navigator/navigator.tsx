import { PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { isSqlDialect } from '@tamery/shared/enums/connection-type'
import { SidebarMenuButton } from '@tamery/ui/components/sidebar'
import { useParams, useRouter } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { useSubscription } from 'seitu/react'

import { useConnectionContext } from '~/core/connection/route'
import { QueryLoggerToggle } from '~/modules/query-logger/query-logger-toggle'
import { newQueryAction } from '~/modules/runner/lib/new-query'
import { pressNavProps } from '~/utils/press-nav'

import { CreateSchemaDialog } from './create-schema-dialog'
import { CreateTableDialog, createTableDialogRef } from './create-table-dialog'
import { CreateViewDialog } from './create-view-dialog'
import { DefinitionsPanel } from './definitions-section'
import { NavigatorSwitcher } from './navigator-switcher'
import { getNavigatorStore } from './stores'
import { TablesPanel } from './tables-panel'

const NavigatorFooter = () => {
  const { connectionResource } = useConnectionContext()
  const router = useRouter()

  return (
    <div className="flex shrink-0 flex-col gap-0.5 pt-1.5 pb-0.5 pl-2">
      <SidebarMenuButton
        {...pressNavProps(() =>
          router.navigate({
            params: {
              resourceId: connectionResource.id,
              tabId: newQueryAction.open(connectionResource.id),
            },
            to: '/connection/$resourceId/$tabId',
          })
        )}
      >
        <HugeiconsIcon
          icon={PlusSignIcon}
          strokeWidth={2}
          className="text-muted-foreground"
        />
        {newQueryAction.label}
      </SidebarMenuButton>
      <QueryLoggerToggle />
    </div>
  )
}

const createTable = (schema?: string) =>
  createTableDialogRef.current?.create(schema)

export const Navigator = () => {
  const { connectionResource, dialect } = useConnectionContext()
  const { tabId } = useParams({ strict: false })
  const navigator = useSubscription(
    getNavigatorStore(connectionResource.id, tabId)
  )

  return (
    <div className="text-foreground flex h-full flex-col pr-1.5">
      <div className="shrink-0 pt-0.5 pb-1.5 pl-2">
        <NavigatorSwitcher />
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={navigator}
            initial={{ opacity: 0, x: navigator === 'tables' ? -12 : 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: navigator === 'tables' ? 12 : -12 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {navigator === 'tables' ? (
              <TablesPanel onCreateTable={createTable} />
            ) : (
              <DefinitionsPanel />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <NavigatorFooter />
      <CreateTableDialog />
      <CreateSchemaDialog />
      {isSqlDialect(dialect) && <CreateViewDialog dialect={dialect} />}
    </div>
  )
}
