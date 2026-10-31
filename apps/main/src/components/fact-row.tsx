import type { IconSvgElement } from '@hugeicons/react'
import { HugeiconsIcon } from '@hugeicons/react'

import { Reveal } from '~/components/reveal'

export const FactRow = ({
  facts,
}: {
  facts: { description: string; icon: IconSvgElement; title: string }[]
}) => (
  <Reveal className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-0">
    {facts.map((fact) => (
      <div
        key={fact.title}
        className="flex flex-col gap-2 sm:border-l sm:px-6 sm:first:border-l-0 sm:first:pl-0"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <HugeiconsIcon
            icon={fact.icon}
            strokeWidth={2}
            className="text-muted-foreground size-4"
          />
          {fact.title}
        </span>
        <p className="text-muted-foreground text-sm text-pretty">
          {fact.description}
        </p>
      </div>
    ))}
  </Reveal>
)
