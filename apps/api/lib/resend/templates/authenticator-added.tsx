import { Section, Text } from '@react-email/components'
import { ORIGINS } from '@tamery/shared/origins'

import { Base } from '../components/base'
import { Button } from '../components/button'

export const AuthenticatorAdded = () => (
  <Base
    preview="An authenticator app was added to your account"
    title="Authenticator app added"
  >
    <Section className="mb-5">
      <Text>
        A code from a new authenticator app now works as your second factor, and
        your backup codes were replaced.
      </Text>
      <Text>
        If this wasn&apos;t you, disable two-factor authentication under
        Authentication and sign out any device you don&apos;t recognize.
      </Text>
    </Section>
    <Button href={`${ORIGINS.web}/settings/security`}>Review security</Button>
  </Base>
)
