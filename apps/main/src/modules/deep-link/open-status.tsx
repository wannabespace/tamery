import { AppLogo } from '@tamery/ui/components/brand/app-logo'
import type { ReactNode } from 'react'

export const OpenStatus = ({
  children,
  description,
  title,
}: {
  children: ReactNode
  description: ReactNode
  title: ReactNode
}) => (
  <main className="flex min-h-dvh items-center justify-center p-4">
    <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      <AppLogo className="text-primary size-10" aria-hidden="true" />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm text-balance">
          {description}
        </p>
      </div>
      {children}
    </div>
  </main>
)
