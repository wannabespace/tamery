import { getOS } from '@tamery/shared/os'
import { InlineCode } from '@tamery/ui/components/custom/inline-code'
import { SettingsGroup } from '@tamery/ui/components/custom/settings-group'

import { CommandRow } from './command-row'

export const InstallBridge = () => (
  <SettingsGroup title="Run queries on your computer">
    <CommandRow
      command={
        getOS(navigator.userAgent).type === 'windows'
          ? 'irm https://tamery.app/cli/install.ps1 | iex'
          : 'curl -fsSL https://tamery.app/cli/install.sh | sh'
      }
    >
      Install the CLI on the computer that reaches your databases, then run{' '}
      <InlineCode>tamery bridge</InlineCode> there. It opens this page: click
      Connect and allow this browser in its terminal.
    </CommandRow>
  </SettingsGroup>
)
