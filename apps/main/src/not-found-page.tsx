import { FileNotFoundIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@tamery/ui/components/empty'
import { Link } from '@tanstack/react-router'

export const NotFoundPage = () => (
  <main className="flex min-h-dvh items-center justify-center p-4">
    <Empty className="w-full max-w-md">
      <EmptyHeader>
        <EmptyMedia variant="muted">
          <HugeiconsIcon icon={FileNotFoundIcon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>Page not found</EmptyTitle>
        <EmptyDescription>
          This page does not exist or has moved.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link to="/" />}>
          Back to Tamery
        </Button>
      </EmptyContent>
    </Empty>
  </main>
)
