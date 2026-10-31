import { Chapter } from '~/components/chapter'
import { DocsLink } from '~/components/docs-link'
import { Reveal } from '~/components/reveal'

import { FeatureCard } from './feature-card'
import { FeatureStage } from './feature-stage'
import { FilterIllustration } from './filter-illustration'
import { PeekIllustration } from './peek-illustration'
import { SchemaIllustration } from './schema-illustration'

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
