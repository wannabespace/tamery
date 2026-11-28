import { Section, Text } from '@react-email/components'
import { ORIGINS } from '@tamery/shared/origins'

import { Base } from '../components/base'
import { Button } from '../components/button'

export const PasskeyAdded = () => (
  <Base preview="A passkey was added to your account" title="Passkey added">
    <Section className="mb-5">
      <Text>
        You can now sign in to Tamery with a new passkey, without an email code
        or two-factor authentication.
      </Text>
      <Text>
        If this wasn&apos;t you, delete that passkey under Authentication and
        sign out any device you don&apos;t recognize.
      </Text>
    </Section>
    <Button href={`${ORIGINS.web}/settings/security`}>Review passkeys</Button>
  </Base>
)
