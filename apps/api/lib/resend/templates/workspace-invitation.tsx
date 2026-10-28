import { Section, Text } from '@react-email/components'
import type { InvitableRole } from '@tamery/shared/workspace'

import { Base } from '../components/base'
import { Button } from '../components/button'

const ROLE_WITH_ARTICLE: Record<InvitableRole, string> = {
  admin: 'an admin',
  editor: 'an editor',
  viewer: 'a viewer',
}

export const WorkspaceInvitation = ({
  inviterName,
  role,
  url,
  workspaceName,
}: {
  inviterName: string
  role: InvitableRole
  url: string
  workspaceName: string
}) => (
  <Base
    preview={`${inviterName} invited you to ${workspaceName}`}
    title={`Join ${workspaceName}`}
  >
    <Section className="mb-5">
      <Text>
        {inviterName} invited you to the <strong>{workspaceName}</strong>{' '}
        workspace as {ROLE_WITH_ARTICLE[role]}, so you can use its connections.
      </Text>
      <Text>
        Open the invitation to join. It also waits for you in Tamery&apos;s
        workspace menu.
      </Text>
    </Section>
    <Section className="mb-5">
      <Button href={url}>View invitation</Button>
    </Section>
    <Section>
      <Text>
        If you don&apos;t know {inviterName}, you can ignore this email.
      </Text>
    </Section>
  </Base>
)
