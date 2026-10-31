import {
  ArrowUpRight01Icon,
  GithubIcon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { SOCIAL_LINKS } from '@tamery/shared/constants'
import { MeshBackground } from '@tamery/ui/components/custom/mesh-background'
import { cn } from '@tamery/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { Fragment } from 'react'

import { orpc } from '~/lib/orpc'

import { GetStartedButtons } from './get-started-buttons'
import { Showcase } from './showcase/showcase'

const riseClassName =
  'animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-800 ease-house motion-reduce:animate-none'

const WORD_STAGGER_MS = 80

// Blur stays on the inner span: Chrome never composites a blur, so on one element it freezes the word during hydration.
const wordClassName =
  'animate-in fade-in slide-in-from-bottom-3 fill-mode-both inline-block duration-900 ease-house motion-reduce:animate-none'

const HEADLINE_WORDS = 'The database client for you and your agents'.split(' ')

const TILT_DEGREES = 14
const TILT_SCROLL_DISTANCE = 480

const UsageLine = () => {
  const { data: userCount, isPending } = useQuery(orpc.userCount.queryOptions())

  return (
    <p
      className={cn(
        isPending ? 'invisible' : riseClassName,
        'text-muted-foreground flex shrink-0 items-center gap-1.5 text-sm delay-1100 lg:h-9'
      )}
    >
      {!!userCount && (
        <>
          <span className="inline-flex items-center gap-1">
            <HugeiconsIcon
              icon={UserMultipleIcon}
              strokeWidth={2}
              className="size-3.5"
            />
            Used by {userCount.toLocaleString('en')}+ people
          </span>
          <span aria-hidden>·</span>
        </>
      )}
      <a
        href={SOCIAL_LINKS.GITHUB}
        target="_blank"
        rel="noopener noreferrer"
        className="text-foreground decoration-foreground/20 hover:decoration-foreground inline-flex items-center gap-1 underline underline-offset-4 transition-colors"
      >
        <HugeiconsIcon icon={GithubIcon} strokeWidth={2} className="size-3.5" />
        Open source
        <HugeiconsIcon
          icon={ArrowUpRight01Icon}
          strokeWidth={2}
          className="size-3"
        />
      </a>
    </p>
  )
}

const TiltedShowcase = () => {
  const reduceMotion = useReducedMotion()
  const { scrollY } = useScroll()
  const rotateX = useTransform(
    scrollY,
    [0, TILT_SCROLL_DISTANCE],
    [TILT_DEGREES, 0]
  )

  return (
    <motion.div style={reduceMotion ? undefined : { rotateX }}>
      <Showcase />
    </motion.div>
  )
}

export const Hero = () => (
  <section className="overflow-x-clip pt-16 sm:pt-24">
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="max-w-4xl text-4xl tracking-tight text-balance sm:text-6xl lg:text-7xl">
          {HEADLINE_WORDS.map((word, index) => (
            <Fragment key={word}>
              {index > 0 && ' '}
              <span
                // oxlint-disable-next-line shadcn/no-inline-styles -- each word's stagger is its index times a step, which no class can describe
                style={{ animationDelay: `${index * WORD_STAGGER_MS}ms` }}
                className={wordClassName}
              >
                <span className="animate-focus-in fill-mode-both ease-house duration-900 [animation-delay:inherit] motion-reduce:animate-none">
                  {word}
                </span>
              </span>
            </Fragment>
          ))}
        </h1>
        <p
          className={cn(
            riseClassName,
            'text-muted-foreground mt-6 text-lg text-balance delay-550'
          )}
        >
          <span className="sm:block">
            Postgres, MySQL, MariaDB, SQL Server, Oracle, ClickHouse, MongoDB,
            SQLite, Turso and Cloudflare D1 in one fast client.
          </span>{' '}
          AI writes the SQL, and your agents query through MCP.
        </p>
        <GetStartedButtons className={cn(riseClassName, 'mt-8 delay-650')} />
      </div>
      <UsageLine />
    </div>
    <div className="animate-in fade-in slide-in-from-bottom-10 fill-mode-both mx-auto mt-16 max-w-7xl px-4 delay-800 duration-1400 motion-reduce:animate-none sm:mt-20 sm:px-6">
      <div className="bg-primary relative isolate h-120 overflow-hidden rounded-3xl px-4 pt-10 perspective-distant sm:h-144 sm:px-8 sm:pt-16 xl:px-16">
        <MeshBackground className="-z-10" />
        <TiltedShowcase />
      </div>
    </div>
  </section>
)
