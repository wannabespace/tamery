import type { ReactNode } from 'react'

export const OnlineStatus = ({ children }: { children: ReactNode }) => (
  <span className="flex items-center gap-2">
    <span className="bg-success size-1.5 rounded-full" />
    {children}
  </span>
)
