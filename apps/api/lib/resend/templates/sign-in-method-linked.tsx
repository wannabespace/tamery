import { Section, Text } from '@react-email/components'

import { env } from '~/env'

import { Base } from '../components/base'
import { Button } from '../components/button'

export const SignInMethodLinked = ({ provider }: { provider: string }) => (
  <Base
    preview={`${provider} was connected to your account`}
    title={`${provider} connected`}
  >
    <Section className="mb-5">
      <Text>
        You can now sign in to Tamery with {provider}. It was connected the
        first time someone signed in with a {provider} account that uses this
        email.
      </Text>
      <Text>
        If this wasn&apos;t you, review your sessions, sign out any device you
        don&apos;t recognize, and secure your {provider} account.
      </Text>
    </Section>
    <Button href={`${env.MAIN_URL}/account/settings`}>Review sessions</Button>
  </Base>
)
