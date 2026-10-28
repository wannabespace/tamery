import { Section, Text } from '@react-email/components'

import { Base } from '../components/base'
import { Button } from '../components/button'

export const WorkspaceInvitation = ({
  inviterName,
  role,
  url,
  workspaceName,
}: {
  inviterName: string
  role: string
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
        workspace as {role === 'viewer' ? 'a viewer' : 'an editor'}, so you can
        use its connections.
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
