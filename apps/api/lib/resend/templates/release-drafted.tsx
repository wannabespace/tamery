import { Section, Text } from '@react-email/components'

import { Base } from '../components/base'
import { Button } from '../components/button'

export const ReleaseDrafted = ({
  url,
  version,
}: {
  url: string
  version: string
}) => (
  <Base
    preview={`Release ${version} is drafted`}
    title={`Release ${version} is drafted`}
  >
    <Section className="mb-5">
      <Text>
        ToDesktop built {version}, and its GitHub release draft is ready to
        review.
      </Text>
      <Text>
        To show this version&apos;s what&apos;s-new card in the app, attach a
        16:9 picture (1600×900, a close-up of the headline feature) to the draft
        as a release asset before publishing. A release without one shows no
        card.
      </Text>
      <Text>
        Publish drafts in version order, or their notes repeat each other&apos;s
        changes.
      </Text>
    </Section>
    <Section>
      <Button href={url}>Open the draft</Button>
    </Section>
  </Base>
)
