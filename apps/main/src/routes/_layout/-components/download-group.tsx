import type { ReactNode } from 'react'

export const DownloadGroup = ({
  children,
  description,
  title,
}: {
  children: ReactNode
  description: string
  title: string
}) => (
  <section className="grid gap-6 border-t py-10 md:grid-cols-2">
    <p className="text-muted-foreground max-w-sm text-pretty">
      <span className="text-foreground">{title}</span> {description}
    </p>
    <div className="flex flex-col">{children}</div>
  </section>
)
