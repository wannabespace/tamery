import type { ReactNode } from 'react'

export const FooterColumn = ({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) => (
  <div className="flex flex-col gap-3 text-sm">
    <h2 className="font-medium">{title}</h2>
    {children}
  </div>
)
