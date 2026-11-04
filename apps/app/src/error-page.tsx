import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { isConnectionFailure } from '@tamery/connection/diagnose'
import { isKeychainLocked } from '@tamery/shared/keychain'
import { toError } from '@tamery/shared/utils'
import { Button } from '@tamery/ui/components/button'
import { CopyButton } from '@tamery/ui/components/custom/copy-button'
import { ScrollArea } from '@tamery/ui/components/custom/scroll-area'
import { Toaster } from '@tamery/ui/components/sonner'
import { cn } from '@tamery/ui/lib/utils'
import { ThemeObserver } from '@tamery/ui/theme-observer'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { useRouter } from '@tanstack/react-router'
import { TraversalError } from 'arktype'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'

import { fullSignOut } from '~/lib/auth'
import { restartToUnlock } from '~/lib/device-encryption'
import { posthog } from '~/lib/posthog'

const getStack = (error: Error) => {
  if (!error.stack) {
    return null
  }

  return error.stack.startsWith(`Error: ${error.message}`)
    ? error.stack.split('\n').slice(1).join('\n')
    : error.stack
}

const isReadableMessage = (message: string) => {
  const trimmed = message.trim()
  return !trimmed.startsWith('{') && !trimmed.startsWith('[')
}

export const ErrorPage = ({ error: thrown }: ErrorComponentProps) => {
  const router = useRouter()
  const [showDetails, setShowDetails] = useState(false)

  const error = toError(thrown)
  const isConnectionError = isConnectionFailure(error.message)
  const isLocked = isKeychainLocked(thrown)

  useEffect(() => {
    if (!(isConnectionError || isLocked)) {
      posthog.captureException(thrown)
    }
  }, [thrown, isConnectionError, isLocked])
  const isValidationError = error instanceof TraversalError
  const stack = getStack(error)
  const cause =
    error.cause && !String(error.cause).includes(error.message)
      ? String(error.cause)
      : null
  const arkErrors = isValidationError ? error.arkErrors : null

  let description = 'An unexpected error occurred while showing this page.'
  if (isLocked) {
    description =
      'Restart Tamery to unlock saved connections, or sign out to reset this device.'
  } else if (isConnectionError) {
    description =
      'Check your database connection settings and network, then try again.'
  } else if (isValidationError) {
    description = 'Some data did not match the format the app expected.'
  }

  // A connection failure's message is a raw driver/OpenSSL dump; the description already explains it, and the full text stays under Show details.
  const summary =
    !isConnectionError && isReadableMessage(error.message)
      ? error.message.split('\n')[0]
      : null

  const details = arkErrors?.length
    ? arkErrors.map((err, index) => `${index + 1}. ${err.message}`).join('\n\n')
    : [error.message, cause, stack].filter(Boolean).join('\n\n')

  return (
    <>
      <ThemeObserver />
      <Toaster />
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          className="relative flex w-full max-w-lg flex-col items-center"
        >
          <div className="border-destructive/10 bg-destructive/10 mb-5 flex size-14 items-center justify-center rounded-2xl border">
            <HugeiconsIcon
              icon={Alert02Icon}
              strokeWidth={2}
              className="text-destructive size-7"
            />
          </div>

          <h1 className="text-base font-semibold tracking-tight">
            Something went wrong
          </h1>
          <p className="text-muted-foreground mt-1.5 max-w-sm text-center text-sm">
            {description}
          </p>

          {summary && (
            <p
              data-mask
              className="text-2xs text-muted-foreground/70 mt-4 max-w-md text-center font-mono leading-relaxed"
            >
              {summary}
            </p>
          )}

          <div className="mt-7 flex items-center gap-2">
            <Button variant="ghost-muted" onClick={() => router.history.back()}>
              Go back
            </Button>
            <Button
              variant="ghost-muted"
              onClick={() => router.navigate({ to: '/' })}
            >
              Home
            </Button>
            {isLocked ? (
              <>
                <Button
                  variant="ghost-muted"
                  onClick={() => {
                    posthog.capture('signed_out_to_unlock')
                    void fullSignOut()
                  }}
                >
                  Sign out
                </Button>
                <Button onClick={restartToUnlock}>Restart Tamery</Button>
              </>
            ) : (
              <Button onClick={() => window.location.reload()}>Refresh</Button>
            )}
          </div>

          <div className="text-muted-foreground/70 mt-5 flex items-center gap-1 text-xs">
            <CopyButton variant="ghost" size="xs" text={details}>
              Copy details
            </CopyButton>
            <span aria-hidden>·</span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setShowDetails((prev) => !prev)}
            >
              {showDetails ? 'Hide details' : 'Show details'}
            </Button>
          </div>

          <div
            className={cn(
              'grid w-full transition-[grid-template-rows] duration-200',
              showDetails ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="text-2xs text-muted-foreground/80 mt-4 flex max-h-56 flex-col border-t text-left font-mono leading-relaxed whitespace-pre-wrap">
                <ScrollArea>
                  <div data-mask className="pt-4">
                    {details}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  )
}
