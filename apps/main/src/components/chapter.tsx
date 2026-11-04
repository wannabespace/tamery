import type { ReactNode } from 'react'

import { Reveal } from './reveal'

export const Chapter = ({
  actions,
  children,
  description,
  id,
  label,
  number,
  subtitle,
  title,
}: {
  actions?: ReactNode
  children: ReactNode
  description?: ReactNode
  id: string
  label: string
  number?: string
  subtitle?: string
  title: string
}) => (
  <section
    id={id}
    aria-labelledby={`${id}-heading`}
    className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24"
  >
    <Reveal className="grid gap-x-6 gap-y-8 border-t pt-8 sm:pt-10 md:grid-cols-12">
      <div className="flex flex-col gap-8 md:col-span-8">
        <p className="text-base">
          {number && (
            <span className="text-muted-foreground mr-2 tabular-nums">
              {number}
            </span>
          )}
          {label}
        </p>
        <h2
          id={`${id}-heading`}
          className="text-3xl tracking-tight text-balance sm:text-4xl lg:text-5xl"
        >
          {title}
          {subtitle && (
            <span className="text-muted-foreground block">{subtitle}</span>
          )}
        </h2>
      </div>
      {(description || actions) && (
        <div className="flex flex-col items-start gap-6 md:col-span-4 md:self-end">
          {description && (
            <p className="text-muted-foreground text-base text-pretty">
              {description}
            </p>
          )}
          {actions}
        </div>
      )}
    </Reveal>
    {children}
  </section>
)
