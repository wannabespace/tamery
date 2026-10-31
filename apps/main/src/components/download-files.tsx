import { AppleIcon, WindowsNewIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { OS } from '@tamery/shared/os'
import { Linux } from '@tamery/ui/components/icons/linux'
import type { ReactNode } from 'react'

export interface DownloadPlatform {
  files: { label: string; link: string }[]
  icon: ReactNode
  os: OS
}

export const DOWNLOAD_PLATFORMS: DownloadPlatform[] = [
  {
    files: [
      {
        label: 'Apple Silicon',
        link: 'https://download.tamery.app/mac/dmg/arm64',
      },
      { label: 'Intel', link: 'https://download.tamery.app/mac/dmg/x64' },
    ],
    icon: <HugeiconsIcon icon={AppleIcon} strokeWidth={2} />,
    os: 'macos',
  },
  {
    files: [
      {
        label: 'Installer (.exe)',
        link: 'https://download.tamery.app/windows/nsis/x64',
      },
    ],
    icon: <HugeiconsIcon icon={WindowsNewIcon} strokeWidth={2} />,
    os: 'windows',
  },
  {
    files: [
      {
        label: 'AppImage',
        link: 'https://download.tamery.app/linux/appImage/x64',
      },
      {
        label: 'Debian and Ubuntu (.deb)',
        link: 'https://download.tamery.app/linux/deb/x64',
      },
      {
        label: 'Fedora and RHEL (.rpm)',
        link: 'https://download.tamery.app/linux/rpm/x64',
      },
    ],
    icon: <Linux />,
    os: 'linux',
  },
]
