import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  pixelBasedPreset,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components'
import { SOCIAL_LINKS } from '@tamery/shared/constants'

import { env } from '~/env'

export const Base = ({
  children,
  footnote,
  preview,
  title,
}: {
  children: React.ReactNode
  footnote?: React.ReactNode
  preview: string
  title: string
}) => (
  <Tailwind
    config={{
      presets: [pixelBasedPreset],
      theme: {
        extend: {
          colors: {
            // Keep in sync with --muted-foreground and --primary in packages/ui/src/styles/globals.css; email clients need sRGB.
            'muted-foreground': '#717171',
            primary: '#006eff',
          },
        },
      },
    }}
  >
    <Html>
      <Head />
      <Body className="font-sans">
        <Preview>{preview}</Preview>
        <Container className="mx-auto max-w-120 px-0 pt-5 pb-12">
          <Section className="mb-5">
            <Img
              src={`${env.MAIN_URL}/logo.png`}
              width="48"
              height="48"
              alt="Tamery"
            />
            <Heading className="mt-5 mb-0 text-2xl font-bold">{title}</Heading>
          </Section>
          {children}
          <Section>
            <Text className="mt-10 text-center text-xs">
              <Link className="text-primary" href={SOCIAL_LINKS.TWITTER}>
                X
              </Link>{' '}
              ・{' '}
              <Link className="text-primary" href={SOCIAL_LINKS.DISCORD}>
                Discord
              </Link>{' '}
              ・{' '}
              <Link className="text-primary" href={SOCIAL_LINKS.GITHUB}>
                GitHub
              </Link>{' '}
              ・{' '}
              <Link className="text-primary" href={env.MAIN_URL}>
                Website
              </Link>
            </Text>
            {footnote && (
              <Text className="text-muted-foreground mt-0 text-center text-xs">
                {footnote}
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  </Tailwind>
)
