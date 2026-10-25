import type { ReactNode } from 'react'

import { SectionEyebrow } from './section-eyebrow'

export const SectionHeading = ({
  children,
  eyebrow,
  id,
  title,
}: {
  children: ReactNode
  eyebrow?: string
  id: string
  title: string
}) => (
  <div className="flex flex-col gap-3">
    {eyebrow && <SectionEyebrow>{eyebrow}</SectionEyebrow>}
    <h2
      id={id}
      className="max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
    >
      {title} <span className="text-muted-foreground">{children}</span>
    </h2>
  </div>
)
