import { Link, Section, Text } from '@react-email/components'

import { env } from '~/env'

import { Base } from '../components/base'
import { Button } from '../components/button'

export const NewSignIn = ({
  device,
  ipAddress,
  location,
}: {
  device: string
  ipAddress: string
  location: string | null
}) => (
  <Base
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
        If it wasn&apos;t, sign that device out and turn on two-factor
        authentication.
      </Text>
    </Section>
    <Button href={`${env.MAIN_URL}/account/settings`}>Review sessions</Button>
    {location && (
      <Text className="text-muted-foreground mt-5 text-xs">
        <Link className="text-muted-foreground" href="https://db-ip.com">
          IP Geolocation by DB-IP
        </Link>
      </Text>
    )}
  </Base>
)
