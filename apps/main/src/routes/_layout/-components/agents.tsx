import {
  Key01Icon,
  SquareLock02Icon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { Reveal } from '~/components/reveal'
import { SectionEyebrow } from '~/components/section-eyebrow'

import { AgentDemo } from './agent-demo/agent-demo'

const POINTS = [
  {
    description:
      'Agents list tables, describe them and run read-only queries without asking.',
    icon: ViewIcon,
    title: 'Reads run freely',
  },
  {
    description:
      'Every write opens a dialog in Tamery. Nothing the agent sent runs before you press Run.',
    icon: SquareLock02Icon,
    title: 'Writes wait for you',
  },
  {
    description:
      'Agents get a token, never your connection strings. Pick what each connection allows.',
    icon: Key01Icon,
    title: 'Strings stay in Tamery',
  },
]

export const Agents = () => (
  <section
    id="agents"
    aria-labelledby="agents-heading"
    className="mx-auto max-w-6xl scroll-mt-24 px-4 py-24 sm:px-6"
  >
    <Reveal className="grid gap-6 md:grid-cols-2 md:items-end">
      <div className="flex flex-col gap-3">
        <SectionEyebrow>Built for agents</SectionEyebrow>
        <h2
          id="agents-heading"
          className="max-w-lg text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl"
        >
          Your agents query. You approve the writes.
        </h2>
      </div>
      <p className="text-muted-foreground max-w-md text-lg text-pretty md:justify-self-end">
        Claude Code, Cursor and other MCP clients reach your databases through
        the desktop app. By default, every write waits for your approval.
      </p>
    </Reveal>
    <Reveal className="mt-14">
      <AgentDemo />
    </Reveal>
    <Reveal className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-0">
      {POINTS.map((point) => (
        <div
          key={point.title}
          className="flex flex-col gap-2 sm:border-l sm:px-6 sm:first:border-l-0 sm:first:pl-0"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <HugeiconsIcon
              icon={point.icon}
              strokeWidth={2}
              className="text-muted-foreground size-4"
            />
            {point.title}
          </span>
          <p className="text-muted-foreground text-sm text-pretty">
            {point.description}
          </p>
        </div>
      ))}
    </Reveal>
  </section>
)
