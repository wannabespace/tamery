import { Section, Text } from '@react-email/components'

import { env } from '~/env'

import { Base } from '../components/base'
import { Button } from '../components/button'

export const TwoFactorChanged = ({ enabled }: { enabled: boolean }) => (
  <Base
    preview={`Two-factor authentication is ${enabled ? 'on' : 'off'}`}
    title={`Two-factor authentication ${enabled ? 'turned on' : 'turned off'}`}
  >
    <Section className="mb-5">
      <Text>
        {enabled
          ? 'Signing in to Tamery now also asks for a second factor.'
          : 'Signing in to Tamery no longer asks for a second factor.'}
      </Text>
      <Text>
        If you didn&apos;t make this change, review your sessions and sign out
        any device you don&apos;t recognize.
      </Text>
    </Section>
    <Button href={`${env.MAIN_URL}/account/authentication`}>
      Review security
    </Button>
  </Base>
)
