import { BRIDGE_INSTALL_COMMANDS } from '@tamery/shared/bridge'
import { getOS } from '@tamery/shared/os'
import { CodeBlock } from '@tamery/ui/components/custom/code-block'
import { CopyIconButton } from '@tamery/ui/components/custom/copy-button'
import { InlineCode } from '@tamery/ui/components/custom/inline-code'
import { SettingsGroup } from '@tamery/ui/components/custom/settings-group'
import { smallItemInsetClassName } from '@tamery/ui/components/item'
import { cn } from '@tamery/ui/lib/utils'

import { posthog } from '~/lib/posthog'

export const InstallBridge = () => {
  const command =
    BRIDGE_INSTALL_COMMANDS[
      getOS(navigator.userAgent).type === 'windows' ? 'powershell' : 'shell'
    ]

  return (
    <SettingsGroup title="Run queries on your computer">
      <div
        className={cn(
          smallItemInsetClassName,
          'flex min-h-12 items-center gap-2 py-3'
        )}
      >
        <p className="text-muted-foreground min-w-0 flex-1 text-pretty">
          Install the CLI on the computer that reaches your databases, then run{' '}
          <InlineCode>tamery bridge</InlineCode> there. It opens this page:
          click Connect and allow this browser in its terminal.
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
    </SettingsGroup>
  )
}
