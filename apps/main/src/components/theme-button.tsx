import { ContrastIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { ThemeToggle } from '@tamery/ui/components/custom/theme-toggle'

export const ThemeButton = () => (
  <ThemeToggle
    side="top"
    render={
      <Button variant="ghost-muted" size="icon-sm" aria-label="Appearance" />
    }
  >
    <HugeiconsIcon icon={ContrastIcon} strokeWidth={2} />
  </ThemeToggle>
)
