import type { AiKeyProvider } from '@tamery/shared/ai-key'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tamery/ui/components/dropdown-menu'
import { AiProviderIcon } from '@tamery/ui/components/icons/ai-provider-icon'
import type { ReactElement, ReactNode } from 'react'

export const AddProvider = ({
  children,
  onPick,
  providers,
  trigger,
}: {
  children: ReactNode
  onPick: (provider: AiKeyProvider) => void
  providers: (readonly [AiKeyProvider, string])[]
  trigger: ReactElement
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger render={trigger}>{children}</DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {providers.map(([provider, name]) => (
        <DropdownMenuItem key={provider} onClick={() => onPick(provider)}>
          <AiProviderIcon provider={name} />
          {name}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
)
