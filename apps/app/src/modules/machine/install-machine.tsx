import { MACHINE_INSTALL_COMMANDS } from '@tamery/shared/machine'
import { getOS } from '@tamery/shared/os'
import { Button } from '@tamery/ui/components/button'
import { CodeBlock } from '@tamery/ui/components/custom/code-block'
import { CopyIconButton } from '@tamery/ui/components/custom/copy-button'
import { InlineCode } from '@tamery/ui/components/custom/inline-code'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { smallItemInsetClassName } from '@tamery/ui/components/item'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@tamery/ui/components/tabs'
import { cn } from '@tamery/ui/lib/utils'

import { posthog } from '~/lib/posthog'

import { MachineAddressDocs } from './machine-address-docs'

const START_COMMAND = 'tamery machine'

const DesktopSteps = () => (
  <>
    <SettingsRow
      title="1. Install the desktop app on that computer"
      description="For a Mac, Windows or Linux computer you use yourself."
    >
      <Button
        variant="outline"
        size="sm"
        render={
          <a
            href={`${import.meta.env.VITE_PUBLIC_MAIN_URL}/download`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Download the desktop app"
            onClick={() => posthog.capture('machine_download_opened')}
          />
        }
      >
        Download
      </Button>
    </SettingsRow>
    <SettingsRow
      title="2. Sign in there with this account"
      description="The computer appears in Your machines."
    />
  </>
)

const CliSteps = () => {
  const command =
    MACHINE_INSTALL_COMMANDS[
      getOS(navigator.userAgent).type === 'windows' ? 'powershell' : 'shell'
    ]

  return (
    <>
      <SettingsRow
        title="1. Install the CLI on that computer"
        description="For a server, or a computer without the desktop app."
      >
        <CopyIconButton
          label="Copy command"
          text={command}
          onClick={() =>
            posthog.capture('machine_command_copied', { copied: 'install' })
          }
        />
      </SettingsRow>
      <div className="border-foreground/6 border-b">
        <CodeBlock
          code={command}
          language="bash"
          padding="item"
          size="xs"
          variant="inset"
          wrap
        />
      </div>
      <SettingsRow
        title={
          <span>
            2. Run <InlineCode>{START_COMMAND}</InlineCode> there
          </span>
        }
        description="Sign in with this account. The computer appears in Your machines."
      >
        <CopyIconButton
          label="Copy command"
          text={START_COMMAND}
          onClick={() =>
            posthog.capture('machine_command_copied', { copied: 'start' })
          }
        />
      </SettingsRow>
    </>
  )
}

const SharedSteps = () => (
  <>
    <SettingsRow
      title="3. Give it an address, unless it is this computer"
      description={
        <>
          An https:// address that reaches it from here.{' '}
          {!window.electron && <MachineAddressDocs />}
        </>
      }
    />
    <SettingsRow
      title="4. Choose it under Runs on in a connection"
      description="Then allow this app on that computer."
    />
  </>
)

export const InstallMachine = () => (
  <SettingsGroup title="Add a machine">
    <Tabs defaultValue="desktop">
      <div className={cn(smallItemInsetClassName, 'pt-3.5')}>
        <TabsList className="w-full">
          <TabsTrigger value="desktop">Desktop app</TabsTrigger>
          <TabsTrigger value="cli">CLI</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="desktop">
        <DesktopSteps />
        <SharedSteps />
      </TabsContent>
      <TabsContent value="cli">
        <CliSteps />
        <SharedSteps />
      </TabsContent>
    </Tabs>
  </SettingsGroup>
)
