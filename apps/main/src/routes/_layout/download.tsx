import { ComputerTerminal01Icon, Globe02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { BREW_INSTALL_COMMAND } from '@tamery/shared/constants'
import { osMap } from '@tamery/shared/os'
import { Button } from '@tamery/ui/components/button'
import { CopyButton } from '@tamery/ui/components/custom/copy-button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from '@tamery/ui/components/item'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'

import type { DownloadPlatform } from '~/components/download-files'
import { DOWNLOAD_PLATFORMS } from '~/components/download-files'
import { useLatestVersion } from '~/hooks/use-latest-version'
import { posthog } from '~/lib/posthog'
import { seo } from '~/utils/seo'

import { DownloadGroup } from './-components/download-group'

const { useLoaderData } = getRouteApi('/_layout')

const captureDownload = (platform: DownloadPlatform, file: string) =>
  posthog.capture('app_downloaded', { file, os: platform.os })

const PrimaryDownload = ({ platform }: { platform?: DownloadPlatform }) => {
  const version = useLatestVersion()
  const file = platform?.files[0]

  if (!platform || !file) {
    return (
      <Button
        size="lg"
        className="mt-8"
        render={
          <a
            href={import.meta.env.VITE_PUBLIC_WEB_URL}
            aria-label="Open Tamery in your browser"
          />
        }
      >
        Open in browser
      </Button>
    )
  }

  return (
    <>
      <Button
        size="lg"
        className="mt-8"
        render={
          <a
            href={file.link}
            download
            aria-label={`Download for ${osMap[platform.os].label}`}
            onClick={() => captureDownload(platform, file.label)}
          />
        }
      >
        {platform.icon}
        Download for {osMap[platform.os].label}
      </Button>
      <p className="text-muted-foreground mt-3 text-xs">
        {version && `Version ${version} · `}
        {file.label}
      </p>
    </>
  )
}

const DownloadPage = () => {
  const os = useLoaderData()
  const current = DOWNLOAD_PLATFORMS.find(
    (platform) => platform.os === os?.type
  )

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-16 pb-24 sm:px-6 sm:pt-24">
      <header className="flex flex-col items-center text-center">
        <img src="/logo.png" alt="" className="size-28" />
        <h1 className="mt-8 text-4xl tracking-tight text-balance sm:text-5xl">
          Download Tamery
        </h1>
        <p className="text-muted-foreground mt-3 text-lg text-balance">
          Free on macOS, Windows and Linux, and in your browser.
        </p>
        <PrimaryDownload platform={current} />
      </header>
      <div className="mt-20">
        <DownloadGroup
          title="Desktop."
          description="The full app. It runs the MCP server your agents connect to, SSH tunnels and local SQLite files."
        >
          {DOWNLOAD_PLATFORMS.flatMap((platform) =>
            platform.files.map((file) => (
              <Item key={file.link} variant="grouped" size="sm">
                <ItemMedia variant="icon">{platform.icon}</ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    {osMap[platform.os].label}
                    <span className="text-muted-foreground font-normal">
                      {file.label}
                    </span>
                  </ItemTitle>
                </ItemContent>
                <ItemActions>
                  <Button
                    size="xs"
                    variant="outline"
                    render={
                      <a
                        href={file.link}
                        download
                        aria-label={`Download ${osMap[platform.os].label} ${file.label}`}
                        onClick={() => captureDownload(platform, file.label)}
                      />
                    }
                  >
                    Download
                  </Button>
                </ItemActions>
              </Item>
            ))
          )}
        </DownloadGroup>
        <DownloadGroup
          title="Homebrew."
          description="Install and update the Mac app from your terminal."
        >
          <Item variant="grouped" size="sm">
            <ItemMedia variant="icon">
              <HugeiconsIcon
                icon={ComputerTerminal01Icon}
                strokeWidth={2}
                className="text-muted-foreground"
              />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                <code className="font-mono text-xs">
                  {BREW_INSTALL_COMMAND}
                </code>
              </ItemTitle>
            </ItemContent>
            <ItemActions>
              <CopyButton
                size="xs"
                variant="outline"
                text={BREW_INSTALL_COMMAND}
                onClick={() =>
                  posthog.capture('install_command_copied', {
                    tool: 'homebrew',
                  })
                }
              >
                Copy
              </CopyButton>
            </ItemActions>
          </Item>
        </DownloadGroup>
        <DownloadGroup
          title="Web app."
          description="The same client in your browser, with nothing to install."
        >
          <Item variant="grouped" size="sm">
            <ItemMedia variant="icon">
              <HugeiconsIcon
                icon={Globe02Icon}
                strokeWidth={2}
                className="text-muted-foreground"
              />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Web app</ItemTitle>
            </ItemContent>
            <ItemActions>
              <Button
                size="xs"
                variant="outline"
                render={
                  <a
                    href={import.meta.env.VITE_PUBLIC_WEB_URL}
                    aria-label="Open Tamery in your browser"
                  />
                }
              >
                Open
              </Button>
            </ItemActions>
          </Item>
        </DownloadGroup>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/_layout/download')({
  component: DownloadPage,
  head: () =>
    seo({
      title: 'Download Tamery for macOS, Windows and Linux',
      description:
        'Download Tamery for macOS (Apple Silicon and Intel), Windows, and Linux. Available as DMG, EXE, DEB, RPM, and AppImage.',
      path: '/download',
    }),
})
