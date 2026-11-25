import { Section, Text } from '@react-email/components'

import { Base } from '../components/base'
import { Button } from '../components/button'

export const TeamSeat = ({
  ownerName,
  url,
}: {
  ownerName: string
  url: string
}) => (
  <Base
    preview={`${ownerName} gave you a seat on their Team plan`}
    title="You have Tamery Pro"
  >
    <Section className="mb-5">
      <Text>
        {ownerName} gave you a seat on their Team plan, so every Pro feature is
        yours at no cost.
      </Text>
      <Text>Sign in to Tamery with this email address to use it.</Text>
    </Section>
    <Section className="mb-5">
      <Button href={url}>Open your account</Button>
    </Section>
    <Section>
      <Text>
        If you don&apos;t know {ownerName}, you can ignore this email.
      </Text>
    </Section>
  </Base>
)
