import {
  AiChat02Icon,
  SecurityCheckIcon,
  Table01Icon,
} from '@hugeicons/core-free-icons'

import { Chapter } from '~/components/chapter'
import { DocsLink } from '~/components/docs-link'
import { FactRow } from '~/components/fact-row'
import { Reveal } from '~/components/reveal'

import { AskIllustration } from './ask-illustration'
import { FeatureStage } from './feature-stage'

const FACTS = [
  {
    description:
      'Every query comes with its SQL and the rows it returned. Open it as a query, or see it as a chart.',
    icon: Table01Icon,
    title: 'Answers you can check',
  },
  {
    description:
      'A change waits for your Run, with the rows the database expects it to touch. Auto mode runs only what adds.',
    icon: SecurityCheckIcon,
    title: 'Nothing changes unasked',
  },
  {
    description:
      'Chats open in tabs beside your tables, one list per database, on every device.',
    icon: AiChat02Icon,
    title: 'Every chat is a tab',
  },
]

export const Ask = () => (
  <Chapter
    id="ask"
    number="02"
    label="Ask"
    title="Ask your database anything."
    subtitle="It asks you before it writes."
    description="The AI agent reads your schema and runs read-only queries on its own. Anything that changes your data waits for you."
    actions={
      <DocsLink path="/features/ai-assistant" source="features">
        The AI assistant
      </DocsLink>
    }
  >
    <Reveal className="mt-12">
      <FeatureStage>
        <AskIllustration />
      </FeatureStage>
    </Reveal>
    <FactRow facts={FACTS} />
  </Chapter>
)
