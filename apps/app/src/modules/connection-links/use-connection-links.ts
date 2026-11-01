import type { ConnectionParts } from '@tamery/connection/connection-parts'
import { connectionParts } from '@tamery/connection/connection-parts'
import { guessConnection } from '@tamery/connection/guess'
import { getDialect } from '@tamery/shared/enums/connection-type'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

import { getCollections } from '~/core/collections'
import { findResource } from '~/core/connection/resources'
import {
  checkCanAddConnection,
  workspaceSelection,
} from '~/core/workspace/utils'
import { posthog } from '~/lib/posthog'

declare module '@tanstack/react-router' {
  interface HistoryState {
    /** Lives in history state, not the URL: the link can hold a password and the URL is saved as the last location. */
    connectionLink?: string
  }
}

const getServer = (parts: Partial<ConnectionParts>) =>
  parts.type &&
  [
    getDialect(parts.type),
    parts.host?.toLowerCase(),
    connectionParts.port(parts),
    parts.user,
    parts.ssh?.host,
  ].join('\n')

export const useConnectionLinks = () => {
  const navigate = useNavigate()

  useEffect(() => {
    const takeLink = async () => {
      const link = await window.electron?.connectionLinks.take()
      if (!link) {
        return
      }
      const parts = guessConnection(link)?.parts ?? {}
      const dialect = parts.type && getDialect(parts.type)
      const {
        connectionsCollection,
        connectionStringsCollection,
        workspacesCollection,
      } = getCollections()
      const workspace = workspaceSelection.current(workspacesCollection.toArray)
      const candidates = connectionsCollection.toArray.filter(
        (connection) =>
          connection.workspaceId === workspace?.id &&
          getDialect(connection.type) === dialect &&
          connectionStringsCollection.has(connection.id)
      )
      const servers = await Promise.all(
        candidates.map(async (connection) =>
          getServer(
            connectionParts.parse(
              await connectionStringsCollection.utils.decrypt(connection.id)
            )
          )
        )
      )
      const connectionId = candidates[servers.indexOf(getServer(parts))]?.id
      // Never inserts: the link comes from any page the browser opens, so it may only reach a database the user already saved.
      const resourceId =
        connectionId &&
        findResource(
          connectionId,
          parts.database ||
            connectionStringsCollection.get(connectionId)
              ?.defaultResourceName ||
            null
        )?.id
      posthog.capture('connection_link_opened', { matched: !!resourceId })
      if (resourceId) {
        await navigate({
          params: { resourceId },
          to: '/connection/$resourceId',
        })
      } else if (checkCanAddConnection(connectionsCollection.size)) {
        await navigate({ state: { connectionLink: link }, to: '/create' })
      }
    }
    void takeLink()
    return window.electron?.app.onUrlOpened(takeLink)
  }, [navigate])
}
