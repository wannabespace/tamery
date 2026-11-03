import { Section, Text } from '@react-email/components'

import { env } from '~/env'

import { Base } from '../components/base'
import { Button } from '../components/button'

export const BackupCodesRegenerated = () => (
  <Base
    preview="Your two-factor backup codes were replaced"
    title="Backup codes regenerated"
  >
    <Section className="mb-5">
      <Text>
        Your two-factor backup codes were replaced, and the old ones no longer
        work.
      </Text>
      <Text>
        If this wasn&apos;t you, regenerate them under Authentication and sign
        out any device you don&apos;t recognize.
      </Text>
    </Section>
    <Button href={`${env.MAIN_URL}/account/authentication`}>
      Review security
    </Button>
  </Base>
)
