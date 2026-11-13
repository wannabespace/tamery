import { isSqlDialect } from '@tamery/shared/enums/connection-type'
import { useParams } from '@tanstack/react-router'
import { Activity } from 'react'
import { useSubscription } from 'seitu/react'

import { useConnectionContext } from '~/core/connection/route'
import { ChatList } from '~/modules/chat/chat-list'

import { CreateSchemaDialog } from './create-schema-dialog'
import { CreateTableDialog, createTableDialogRef } from './create-table-dialog'
import { CreateViewDialog } from './create-view-dialog'
import { DefinitionsPanel } from './definitions-section'
import { NavigatorHeader } from './navigator-header'
import { getNavigatorStore } from './stores'
import { TablesPanel } from './tables-panel'

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
      <NavigatorHeader />
      <Activity mode={navigator === 'tables' ? 'visible' : 'hidden'}>
        <div className="flex min-h-0 flex-1 flex-col">
          <TablesPanel onCreateTable={createTable} />
        </div>
      </Activity>
      <Activity mode={navigator === 'definitions' ? 'visible' : 'hidden'}>
        <div className="flex min-h-0 flex-1 flex-col">
          <DefinitionsPanel />
        </div>
      </Activity>
      <Activity mode={navigator === 'chats' ? 'visible' : 'hidden'}>
        <div className="flex min-h-0 flex-1 flex-col">
          <ChatList />
        </div>
      </Activity>
      <CreateTableDialog />
      <CreateSchemaDialog />
      {isSqlDialect(dialect) && <CreateViewDialog dialect={dialect} />}
    </div>
  )
}
