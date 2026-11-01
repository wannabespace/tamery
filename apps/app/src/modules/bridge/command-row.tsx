import { CodeBlock } from '@tamery/ui/components/custom/code-block'
import { CopyIconButton } from '@tamery/ui/components/custom/copy-button'
import { smallItemInsetClassName } from '@tamery/ui/components/item'
import { cn } from '@tamery/ui/lib/utils'
import type { ReactNode } from 'react'

import { posthog } from '~/lib/posthog'

/** A command to paste in a terminal: the instruction and its copy button over the command itself. */
export const CommandRow = ({
  children,
  command,
}: {
  children: ReactNode
  command: string
}) => (
  <>
    <div
      className={cn(
        smallItemInsetClassName,
        'flex min-h-12 items-center gap-2 py-3'
      )}
    >
      <p className="text-muted-foreground min-w-0 flex-1 text-pretty">
        {children}
      </p>
      <CopyIconButton
        label="Copy command"
        text={command}
        onClick={() =>
          posthog.capture('bridge_command_copied', { copied: 'install' })
        }
      />
    </div>
    <CodeBlock
      code={command}
      language="bash"
      padding="item"
      size="xs"
      variant="inset"
      wrap
    />
  </>
)
