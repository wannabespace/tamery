import { SettingsGroup } from '@tamery/ui/components/custom/settings-group'
import { isLinux } from '@tamery/ui/lib/os'

import { ElectronSwitchRow } from './electron-switch-row'

export const GeneralSettings = () => (
  <SettingsGroup>
    {window.electron && !isLinux && (
      <ElectronSwitchRow
        id="open-at-login"
        title="Start at login"
        description="Opens Tamery when you log in to this computer."
        event="open_at_login_toggled"
        get={() => window.electron?.openAtLogin.get()}
        set={(enabled) => window.electron?.openAtLogin.set(enabled)}
      />
    )}
    {window.electron && (
      <ElectronSwitchRow
        id="connection-links-default"
        title="Open database links in Tamery"
        description="PostgreSQL, MySQL, MariaDB, SQL Server, Oracle, ClickHouse and MongoDB links open the matching connection, or a new one filled in from the link."
        event="connection_links_default_toggled"
        get={() => window.electron?.connectionLinks.isDefault()}
        set={(enabled) => window.electron?.connectionLinks.setDefault(enabled)}
      />
    )}
  </SettingsGroup>
)
