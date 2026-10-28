import { describeConnectionString } from '@tamery/connection/utils'
import { title } from '@tamery/shared/title'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'

import { createConnection } from '~/core/connection/save'
import { permix } from '~/core/user/permissions'
import { useActiveWorkspace } from '~/core/workspace/hooks'
import { workspaceSelection } from '~/core/workspace/utils'
import { posthog } from '~/lib/posthog'
import { ConnectionPage } from '~/modules/connection-form/components/connection-page'

const CreateConnectionPage = () => {
  const { workspaces } = useActiveWorkspace()
  const router = useRouter()

  return (
    <ConnectionPage
      mode={{ kind: 'create' }}
      onSave={async (connection, { open, origin, syncType }) => {
        const workspace = workspaceSelection.target(workspaces)
        if (!workspace) {
          throw new Error('Workspace is still loading. Please try again.')
        }

        const { resourceId } = await createConnection({
          ...connection,
          syncType,
          workspaceId: workspace.id,
        })
        workspaceSelection.set(workspace.id)

        await (open
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
