import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { cardClass } from '@tamery/ui/components/card.utils'
import { CopyIconButton } from '@tamery/ui/components/custom/copy-button'
import { ScrollArea } from '@tamery/ui/components/custom/scroll-area'
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@tamery/ui/components/empty'
import { cn } from '@tamery/ui/lib/utils'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useState } from 'react'

import { diagnoseProxyFailure } from '~/core/connection/diagnosis'
import { useIsOnline } from '~/store'

const errorCauseText = (cause: unknown) => {
  if (cause === null || cause === undefined) {
    return null
  }

  if (cause instanceof Error) {
    return cause.message
  }

  if (typeof cause === 'object') {
    try {
      return JSON.stringify(cause, null, 2)
    } catch {
      return String(cause)
    }
  }

  return String(cause)
}

export const TableError = ({
  children,
  error,
  title,
}: {
  /** The remedies, as `sm` buttons. */
  children?: ReactNode
  error: Error
  title: ReactNode
}) => {
  const [showDetails, setShowDetails] = useState(false)
  const proxyDiagnosis = diagnoseProxyFailure(error, useIsOnline())

  const [summary = ''] = error.message.split('\n')
  const rawCause = errorCauseText(error.cause)
  const cause =
    rawCause && !(error.message && rawCause.includes(error.message))
      ? rawCause
      : null
  const details = [error.message, cause].filter(Boolean).join('\n\n')
  const rest = details.slice(summary.length).trim()

  return (
    <div className="pointer-events-none sticky left-0 flex h-full overflow-hidden pb-12">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        className="pointer-events-auto flex min-w-0 flex-1"
      >
        <Empty size="sm">
          <EmptyHeader>
            <EmptyMedia variant="destructive">
              <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle className="wrap-anywhere">
              {proxyDiagnosis?.title ?? title}
            </EmptyTitle>
          </EmptyHeader>

          <EmptyContent className="max-w-md">
            <div className={cn(cardClass, 'w-full text-left text-wrap')}>
              <div className="flex items-start gap-2 py-2 pr-2 pl-3">
                <p
                  data-mask
                  className="min-w-0 flex-1 py-0.5 font-mono text-xs/5 wrap-anywhere select-text"
                >
                  {summary}
                </p>
                <CopyIconButton label="Copy error" text={details} />
              </div>
              {rest && (
                <motion.div
                  initial={false}
                  animate={{ gridTemplateRows: showDetails ? '1fr' : '0fr' }}
                  transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                  className="grid"
                >
                  <div className="min-h-0 overflow-hidden">
                    <ScrollArea
                      data-mask
                      className="border-foreground/6 text-2xs text-muted-foreground max-h-56 border-t px-3 py-2.5 font-mono leading-relaxed wrap-anywhere whitespace-pre-wrap select-text"
                    >
                      {rest}
                    </ScrollArea>
                  </div>
                </motion.div>
              )}
            </div>
            <div className="flex items-center gap-1.5 pt-2 empty:hidden">
              {children}
              {rest && (
                <Button
                  variant="ghost-muted"
                  size="sm"
                  onClick={() => setShowDetails((prev) => !prev)}
                >
                  {showDetails ? 'Hide details' : 'Show details'}
                </Button>
              )}
            </div>
          </EmptyContent>
        </Empty>
      </motion.div>
    </div>
  )
}
