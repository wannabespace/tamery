import {
  BubbleChatIcon,
  SourceCodeIcon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons'

import { Chapter } from '~/components/chapter'
import { DocsLink } from '~/components/docs-link'
import { FactRow } from '~/components/fact-row'
import { Reveal } from '~/components/reveal'

import { AskIllustration } from './ask-illustration'
import { EditIllustration } from './edit-illustration'
import { FeatureCard } from './feature-card'
import { FeatureStage } from './feature-stage'

const FACTS = [
  {
    description:
      'Tables, columns and the values a column takes, checked against your live schema.',
    icon: SourceCodeIcon,
    title: 'Completion that knows your data',
  },
  {
    description:
      'A statement that failed gets a suggested correction, right next to the error.',
    icon: Wrench01Icon,
    title: 'Fix with AI',
  },
  {
    description:
      'Each database keeps its own chats, and their history follows you to every device.',
    icon: BubbleChatIcon,
    title: 'Chats on every device',
  },
]

export const Query = () => (
  <Chapter
    id="query"
    number="02"
    label="Query"
    title="Write SQL, or have AI write it."
    subtitle="Help that knows your schema."
    description="Completion knows your tables, columns and the values they take. The editor's AI sees your schema, so you never paste it."
    actions={
      <DocsLink path="/features/query-editor#get-ai-help" source="features">
        AI in the editor
      </DocsLink>
    }
  >
    <Reveal className="mt-12 grid gap-x-6 gap-y-12 md:grid-cols-3">
      <FeatureStage className="md:col-span-2">
        <AskIllustration />
      </FeatureStage>
      <FeatureCard
        fill
        title="Edit with AI"
        docsPath="/features/query-editor#get-ai-help"
        description="Say what to change in plain words, then accept or reject the rewrite in place."
      >
        <EditIllustration />
      </FeatureCard>
    </Reveal>
    <FactRow facts={FACTS} />
  </Chapter>
)
