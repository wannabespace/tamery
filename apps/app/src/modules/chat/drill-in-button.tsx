import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'

/** The `→` at the end of a command-list row that opens its nested list (a model's options, a connection's resources). The list keeps focus, so the field under it keeps its caret, and the row's own select never fires. */
export const DrillInButton = ({
  label,
  onOpen,
}: {
  label: string
  onOpen: () => void
}) => (
  <Button
    className="ml-auto"
    variant="ghost-muted"
    size="icon-xs"
    aria-label={label}
    tabIndex={-1}
    onPointerDown={(event) => {
      event.preventDefault()
      event.stopPropagation()
    }}
    onClick={(event) => {
      event.stopPropagation()
      onOpen()
    }}
  >
    <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
  </Button>
)
