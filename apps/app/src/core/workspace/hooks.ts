import { useLiveQuery } from '@tanstack/react-db'
import { useSubscription } from 'seitu/react'

import { useCollections } from '~/core/collections'

import { isViewOnly, workspaceSelection } from './utils'

export const useActiveWorkspace = () => {
  const { workspacesCollection } = useCollections()

  const { data: workspaces } = useLiveQuery({
    query: (q) => q.from({ w: workspacesCollection }),
  })
  const activeId = useSubscription(workspaceSelection.id)

  return { data: workspaceSelection.resolve(workspaces, activeId), workspaces }
}

export const useIsViewOnlyWorkspace = () =>
  isViewOnly(useActiveWorkspace().data)
