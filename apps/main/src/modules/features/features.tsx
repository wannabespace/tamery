import { Reveal } from '~/components/reveal'
import { SectionHeading } from '~/components/section-heading'

import { AskIllustration } from './ask-illustration'
import { BentoCard } from './bento-card'
import { CompletionIllustration } from './completion-illustration'
import { FilterIllustration } from './filter-illustration'
import { KeyboardIllustration } from './keyboard-illustration'
import { SchemaIllustration } from './schema-illustration'
import { ShareIllustration } from './share-illustration'
import { SyncIllustration } from './sync-illustration'

export const Features = () => (
  <section
    id="features"
    aria-labelledby="features-heading"
    className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6"
  >
    <Reveal>
      <SectionHeading
        id="features-heading"
        eyebrow="Features"
        title="Less clicking, more answers."
      >
        Everything you expect from a database client, with AI wherever it saves
        you a step.
      </SectionHeading>
    </Reveal>
    <div className="mt-10 grid gap-4 md:grid-cols-3">
      <BentoCard
        title="One shortcut away"
        description="Press ⌘P to open a table, start a query or chat with AI."
      >
        <KeyboardIllustration />
      </BentoCard>
      <BentoCard
        className="min-h-128 md:col-start-2 md:row-span-2"
        title="Ask in plain English"
        description="The assistant knows your schema. Ask and get the query, the answer and a fix when something fails."
      >
        <AskIllustration />
      </BentoCard>
      <BentoCard
        title="Synced across devices"
        description="Connections follow you everywhere, with or without the password."
      >
        <SyncIllustration />
      </BentoCard>
      <BentoCard
        title="See your schema"
        description="An ER diagram of every table and relation. Drag the cards around."
      >
        <SchemaIllustration />
      </BentoCard>
      <BentoCard
        title="Share a table as a link"
        description="A read-only link to a table with your filters and columns. No account needed to open it."
      >
        <ShareIllustration />
      </BentoCard>
      <BentoCard
        className="md:col-span-2"
        title="Filters from a sentence"
        description="Type what you want to see. Tamery turns it into filters you can still edit by hand."
      >
        <FilterIllustration />
      </BentoCard>
      <BentoCard
        title="Completion that knows your data"
        description="Tables, columns and the values a column takes, checked against your live schema."
      >
        <CompletionIllustration />
      </BentoCard>
    </div>
  </section>
)
