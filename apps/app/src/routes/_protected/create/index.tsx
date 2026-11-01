import { describeConnectionString } from '@tamery/connection/utils'
import { title } from '@tamery/shared/title'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'

import { getCollections } from '~/core/collections'
import { canQueryConnection } from '~/core/connection/fetching'
import { createConnection } from '~/core/connection/save'
import { permix } from '~/core/user/permissions'
import { useActiveWorkspace } from '~/core/workspace/hooks'
import { posthog } from '~/lib/posthog'
import { ConnectionPage } from '~/modules/connection-form/components/connection-page'

const CreateConnectionPage = () => {
  const { data: activeWorkspace } = useActiveWorkspace()
  const router = useRouter()

  return (
    <ConnectionPage
      mode={{ kind: 'create' }}
      onSave={async (connection, { origin, syncType, testFailed }) => {
        if (!activeWorkspace) {
          throw new Error('Workspace is still loading. Please try again.')
        }

        const { id, resourceId } = await createConnection({
          ...connection,
          syncType,
          workspaceId: activeWorkspace.id,
        })
        const saved = getCollections().connectionsCollection.get(id)

        await (!testFailed && saved && canQueryConnection(saved)
          ? router.navigate({
              params: { resourceId },
              to: '/connection/$resourceId',
            })
          : router.navigate({ to: '/' }))
        posthog.capture('connection_created', {
          origin: origin ?? 'form',
          ssh: describeConnectionString(connection.connectionString).usesSsh,
          syncType,
          type: connection.type,
        })
        toast.success('Connection created')
      }}
    />
  )
}

export const Route = createFileRoute('/_protected/create/')({
  beforeLoad: ({ context: { collections } }) => {
    if (
      !permix.check('connection.create', {
        count: collections.connectionsCollection.size,
      })
    ) {
      throw redirect({ to: '/' })
    }
  },
  component: CreateConnectionPage,
  head: () => ({
    meta: [{ title: title('New connection') }],
  }),
})
