import {
  RefreshIcon,
  SquareLock02Icon,
  ViewIcon,
} from '@hugeicons/core-free-icons'

import { Chapter } from '~/components/chapter'
import { DocsLink } from '~/components/docs-link'
import { FactRow } from '~/components/fact-row'
import { Reveal } from '~/components/reveal'

import { FeatureStage } from './feature-stage'
import { ShareIllustration } from './share-illustration'

const FACTS = [
  {
    description:
      'Viewers see your filters, columns and sort, and can only scroll. Nothing to edit, no account to make.',
    icon: ViewIcon,
    title: 'Your view, read-only',
  },
  {
    description:
      'Rows refresh live or every minute, hour or day, so the link stays current without you.',
    icon: RefreshIcon,
    title: 'Always up to date',
  },
  {
    description:
      'Add a password, an expiry and a row limit to any link. Search engines are told to stay out.',
    icon: SquareLock02Icon,
    title: 'Locked down when it matters',
  },
]

export const Share = () => (
  <Chapter
    id="share"
    number="04"
    label="Share"
    title="Send a table, not a screenshot."
    subtitle="One link, no account needed."
    description="Send anyone a read-only link to a table, with your filters, columns and sort."
    actions={
      <DocsLink path="/features/sharing" source="features">
        How sharing works
      </DocsLink>
    }
  >
    <Reveal className="mt-12">
      <FeatureStage className="h-96">
        <ShareIllustration />
      </FeatureStage>
    </Reveal>
    <FactRow facts={FACTS} />
  </Chapter>
)
