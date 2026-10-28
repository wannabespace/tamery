import { Link, Section, Text } from '@react-email/components'

import { env } from '~/env'

import { Base } from '../components/base'
import { Button } from '../components/button'

export const NewSignIn = ({
  device,
  ipAddress,
  location,
  twoFactorEnabled,
}: {
  device: string
  ipAddress: string
  location: string | null
  twoFactorEnabled: boolean
}) => (
  <Base
    footnote={
      location && (
        <Link className="text-muted-foreground" href="https://db-ip.com">
          IP Geolocation by DB-IP
        </Link>
      )
    }
    preview={`New sign-in from ${device}`}
    title="New sign-in to your account"
  >
    <Section className="mb-5">
      <Text>Someone just signed in to your Tamery account.</Text>
      <Text>
        <strong>Device:</strong> {device}
        <br />
        <strong>IP address:</strong> {ipAddress || 'Unknown'}
        {location && (
          <>
            <br />
            <strong>Approximate location:</strong> {location}
          </>
        )}
      </Text>
      <Text>If this was you, there&apos;s nothing to do.</Text>
      <Text>
        {twoFactorEnabled
          ? "If it wasn't, sign that device out right away: whoever it was also got past two-factor authentication."
          : "If it wasn't, sign that device out and turn on two-factor authentication."}
      </Text>
    </Section>
    <Button href={`${env.MAIN_URL}/account/settings`}>Review sessions</Button>
  </Base>
)
