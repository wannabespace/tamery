import { Reveal } from '~/components/reveal'

import { GetStartedButtons } from './get-started-buttons'

export const GetStarted = () => (
  <section
    aria-labelledby="get-started-heading"
    className="mx-auto max-w-6xl px-4 py-32 sm:px-6 sm:py-40"
  >
    <Reveal className="flex flex-col items-center gap-10 text-center">
      <h2
        id="get-started-heading"
        className="text-4xl tracking-tight text-balance sm:text-5xl lg:text-6xl"
      >
        Try Tamery today.
        <span className="text-muted-foreground block">
          Free on macOS, Windows and Linux.
        </span>
      </h2>
      <GetStartedButtons className="justify-center" />
    </Reveal>
  </section>
)
