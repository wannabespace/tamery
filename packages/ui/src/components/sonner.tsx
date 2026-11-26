import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  Loading03Icon,
  MultiplicationSignCircleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { noop } from '@tamery/shared/utils'
import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Toaster as Sonner } from 'sonner'

import { useTheme } from '../theme-store'

const subscribeNever = () => noop

const Toaster = () => {
  const theme = useTheme()
  const isClient = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  )

  if (!isClient) {
    return null
  }

  return createPortal(
    <div data-mask className="contents [&_ol]:z-60!">
      <Sonner
        theme={theme}
        position="top-center"
        className="group"
        icons={{
          error: (
            <HugeiconsIcon
              icon={MultiplicationSignCircleIcon}
              strokeWidth={2}
              className="text-destructive size-4"
            />
          ),
          info: (
            <HugeiconsIcon
              icon={InformationCircleIcon}
              strokeWidth={2}
              className="text-muted-foreground size-4"
            />
          ),
          loading: (
            <HugeiconsIcon
              icon={Loading03Icon}
              strokeWidth={2}
              className="text-muted-foreground size-4 animate-spin"
            />
          ),
          success: (
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              strokeWidth={2}
              className="text-success size-4"
            />
          ),
          warning: (
            <HugeiconsIcon
              icon={Alert02Icon}
              strokeWidth={2}
              className="text-warning size-4"
            />
          ),
        }}
        toastOptions={{
          classNames: {
            actionButton: `
              h-6 shrink-0 self-center rounded-md bg-primary px-2 text-xs
              font-medium whitespace-nowrap text-primary-foreground
              hover:bg-primary/90
            `,
            cancelButton: `
              h-6 shrink-0 self-center rounded-md bg-input px-2 text-xs
              font-medium whitespace-nowrap text-foreground
              hover:bg-accent
            `,
            closeButton: `
              absolute -top-1.5 -left-1.5 flex size-5 items-center justify-center
              rounded-full bg-popover text-muted-foreground shadow-xs ring
              ring-foreground/4
              hover:text-foreground
            `,
            content: 'flex min-w-0 flex-1 flex-col gap-0.5',
            description: 'text-xs leading-snug text-muted-foreground',
            icon: `
              relative flex h-lh w-4 shrink-0 items-center justify-center text-sm
              leading-tight
            `,
            title: 'text-sm leading-tight font-medium text-foreground',
            toast: `
              flex w-(--width) items-center gap-2.5 rounded-xl bg-background/80
              p-3 shadow-lg ring-1 ring-foreground/4 backdrop-blur-xl
              select-none
              has-data-description:items-start
              data-[expanded=false]:data-[front=false]:*:opacity-0
            `,
          },
          unstyled: true,
        }}
      />
    </div>,
    document.body
  )
}

export { Toaster }
