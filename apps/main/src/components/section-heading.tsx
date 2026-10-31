import type { ReactNode } from 'react'

export const SectionHeading = ({
  actions,
  children,
  description,
  id,
  label,
  number,
  title,
}: {
  actions?: ReactNode
  children?: ReactNode
  description?: ReactNode
  id: string
  label: string
  number?: string
  title: string
}) => (
  <div className="grid gap-x-6 gap-y-8 border-t pt-8 sm:pt-10 md:grid-cols-12">
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
        id={id}
        className="text-3xl tracking-tight text-balance sm:text-4xl lg:text-5xl"
      >
        {title}
        {children && (
          <span className="text-muted-foreground block">{children}</span>
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
  </div>
)
