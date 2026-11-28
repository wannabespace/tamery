import {
  SourceCodeIcon,
  SparklesIcon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons'

import { Chapter } from '~/components/chapter'
import { DocsLink } from '~/components/docs-link'
import { FactRow } from '~/components/fact-row'
import { Reveal } from '~/components/reveal'

import { EditIllustration } from './edit-illustration'
import { FeatureStage } from './feature-stage'

const FACTS = [
  {
    description:
      'Say what to change in plain words, then accept or reject the rewrite in place.',
    icon: SparklesIcon,
    title: 'Edit with AI',
  },
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
]

export const Query = () => (
  <Chapter
    id="query"
    number="03"
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
    <Reveal className="mt-12">
      <FeatureStage className="h-80">
        <EditIllustration />
      </FeatureStage>
    </Reveal>
    <FactRow facts={FACTS} />
  </Chapter>
)
