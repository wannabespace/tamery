import { AppLogo } from '@tamery/ui/components/brand/app-logo'
import { cn } from '@tamery/ui/lib/utils'

export const titleBarClassName =
  'flex h-10 shrink-0 items-center border-b border-transparent'

export const resourcePanelClassName =
  'bg-background ring-foreground/4 flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl ring'

export const centeredPageClassName =
  'mx-auto flex min-h-full w-full max-w-2xl flex-col px-6 py-12'

export const settingsPageClassName = 'flex min-h-0 flex-1 p-2'

// w-70 is the navigator panel's defaultSize (modules/navigator/panel.ts): keep them equal or, at the default width, the panel edge jumps entering Settings.
export const settingsSidebarClassName =
  'flex w-70 shrink-0 flex-col gap-4 pt-0.5 pr-1.5 pl-2'

const ShellFrame = ({
  children,
  id,
}: {
  children: React.ReactNode
  id: string
}) => (
  <div
    aria-hidden
    className="pointer-events-none fixed inset-0 flex flex-col"
    data-shell
    id={id}
  >
    <div
      className={cn(
        titleBarClassName,
        'border-b-border bg-card gap-1.5 [-webkit-app-region:drag]'
      )}
      data-shell-titlebar
    >
      <div className="flex w-full items-center px-2">
        <div className="shrink-0 p-1.5">
          <AppLogo className="text-primary size-4" />
        </div>
      </div>
    </div>
    {children}
  </div>
)

const ConnectionShell = () => (
  <ShellFrame id="shell-connection">
    <div className="flex min-h-0 flex-1 p-2">
      <div className="h-full shrink-0" data-shell-left />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className={resourcePanelClassName}>
          <div className="h-8 shrink-0" />
        </div>
        <div
          className="flex min-h-0 shrink-0 flex-col pt-1.5"
          data-shell-bottom
        >
          <div className={resourcePanelClassName}>
            <div className="h-8 shrink-0" />
          </div>
        </div>
      </div>
    </div>
  </ShellFrame>
)

const DashboardShell = () => (
  <ShellFrame id="shell-dashboard">
    <div className={centeredPageClassName} />
  </ShellFrame>
)

const SettingsShell = () => (
  <ShellFrame id="shell-settings">
    <div className={settingsPageClassName}>
      <div className={settingsSidebarClassName} />
      <div className={resourcePanelClassName} />
    </div>
  </ShellFrame>
)

const AuthShell = () => (
  <div
    aria-hidden
    className="traffic-lights:pt-10 pointer-events-none fixed inset-0 grid lg:grid-cols-2"
    data-shell
    id="shell-auth"
  >
    <div className="bg-body traffic-lights:mt-0 m-2 hidden rounded-2xl lg:block" />
    <div className="absolute inset-x-0 top-0 h-10 [-webkit-app-region:drag]" />
  </div>
)

export const Shells = () => (
  <>
    <AuthShell />
    <DashboardShell />
    <SettingsShell />
    <ConnectionShell />
  </>
)
