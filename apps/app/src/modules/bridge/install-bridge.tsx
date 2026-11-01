import { getOS } from '@tamery/shared/os'
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
      copied="install"
    >
      Install the CLI on the computer that reaches your databases, then run{' '}
      <code className="text-foreground font-mono text-xs">tamery bridge</code>{' '}
      there. It opens a link that pairs this browser.
    </CommandRow>
  </SettingsGroup>
)
