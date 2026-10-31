import { ConnectionIcon } from '@tamery/ui/components/icons/connection-icon'

import { Reveal } from '~/components/reveal'
import { shownEngines } from '~/utils/engines'

export const Engines = () => (
  <section
    aria-label="Supported databases"
    className="mx-auto max-w-6xl px-4 pt-12 pb-8 sm:px-6"
  >
    <Reveal className="text-muted-foreground flex flex-wrap justify-center gap-x-12 gap-y-6 sm:grid sm:grid-cols-4 sm:justify-items-center">
      {shownEngines.map(({ label, provider, type }) => (
        <span
          key={label}
          className="flex items-center justify-center gap-2.5 text-base font-medium"
        >
          <ConnectionIcon type={type} provider={provider} className="size-6" />
          {label}
        </span>
      ))}
    </Reveal>
  </section>
)
