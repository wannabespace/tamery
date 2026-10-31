import {
  BubbleChatIcon,
  RefreshIcon,
  SourceCodeIcon,
  SquareLock02Icon,
  ViewIcon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons'

import { Chapter } from '~/components/chapter'
import { DocsLink } from '~/components/docs-link'
import { FactRow } from '~/components/fact-row'
import { Reveal } from '~/components/reveal'

import { AskIllustration } from './ask-illustration'
import { EditIllustration } from './edit-illustration'
import { FeatureCard, FeatureStage } from './feature-blocks'
import { FilterIllustration } from './filter-illustration'
import { PeekIllustration } from './peek-illustration'
import { SchemaIllustration } from './schema-illustration'
import { ShareIllustration } from './share-illustration'

export const Explore = () => (
  <Chapter
    id="features"
    number="01"
    label="Explore"
    title="Browse tables like a spreadsheet."
    subtitle="Or just say which rows you want."
    description="Type a sentence and AI turns it into filters you can still edit. Follow any foreign key without leaving the table, and see every relation on one diagram."
    actions={
      <DocsLink path="/features/table-browser" source="features">
        The table browser
      </DocsLink>
    }
  >
    <Reveal className="mt-12">
      <FeatureStage className="h-80">
        <FilterIllustration />
      </FeatureStage>
    </Reveal>
    <Reveal className="mt-6 grid gap-x-6 gap-y-12 md:grid-cols-2">
      <FeatureCard
        title="Follow any foreign key"
        docsPath="/features/table-browser#find-the-rows-you-need"
        description="Peek at the row a key points to, or the rows pointing back, right where you are."
      >
        <PeekIllustration />
      </FeatureCard>
      <FeatureCard
        title="See your schema"
        docsPath="/features/schema-visualizer"
        description="An ER diagram of every table and relation. Drag the cards around."
      >
        <SchemaIllustration />
      </FeatureCard>
    </Reveal>
  </Chapter>
)

const QUERY_FACTS = [
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
    <FactRow facts={QUERY_FACTS} />
  </Chapter>
)

const SHARE_FACTS = [
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
    <FactRow facts={SHARE_FACTS} />
  </Chapter>
)
