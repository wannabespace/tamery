import { Section, Text } from '@react-email/components'

import { Base } from '../components/base'

export const AccountDeleted = () => (
  <Base preview="Your Tamery account was deleted" title="Account deleted">
    <Section>
      <Text>
        Your Tamery account and its data have been deleted. We keep a copy for
        90 days, then erase it for good. The databases you connected to were not
        touched.
      </Text>
      <Text>If you didn&apos;t do this, reply to this email right away.</Text>
    </Section>
  </Base>
)
