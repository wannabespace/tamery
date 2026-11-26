import {
  Delete02Icon,
  PencilEdit01Icon,
  PlusSignIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { AiKeyProvider } from '@tamery/shared/ai-key'
import { AI_KEY_PROVIDERS } from '@tamery/shared/ai-key'
import { objectEntries } from '@tamery/shared/utils'
import { Button } from '@tamery/ui/components/button'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tamery/ui/components/dropdown-menu'
import { AiProviderIcon } from '@tamery/ui/components/icons/ai-provider-icon'
import { Switch } from '@tamery/ui/components/switch'
import { useMutation } from '@tanstack/react-query'
import type { ReactElement, ReactNode } from 'react'
import { useState } from 'react'

import { AppContextMenu, AppMenuButton } from '~/components/app-context-menu'
import type { AppMenuNode } from '~/components/app-menu'
import { useHasAccount } from '~/lib/auth'
import type { ORPCOutputs } from '~/lib/orpc'
import { orpc } from '~/lib/orpc'
import { promptSignIn } from '~/store'

import { AiKeyDialog } from './ai-key-dialog'
import { refreshAi } from './refresh-ai'

type SavedAiKey = ORPCOutputs['account']['aiKey']['list'][number]

const ProviderRow = ({
  aiKey: { enabled, end, provider },
  onReplace,
}: {
  aiKey: SavedAiKey
  onReplace: () => void
}) => {
  const name = AI_KEY_PROVIDERS[provider]
  const remove = useMutation({
    ...orpc.account.aiKey.remove.mutationOptions(),
    meta: { event: 'ai_key_removed' },
    onSuccess: refreshAi,
  })
  const toggle = useMutation({
    ...orpc.account.aiKey.setEnabled.mutationOptions(),
    meta: { event: 'ai_key_toggled' },
    onSuccess: refreshAi,
  })
  const items: AppMenuNode[] = [
    { icon: PencilEdit01Icon, label: 'Replace key', onSelect: onReplace },
    { type: 'separator' },
    {
      icon: Delete02Icon,
      label: 'Remove',
      onSelect: () => remove.mutate({ provider }),
      variant: 'destructive',
    },
  ]

  return (
    <AppContextMenu
      items={items}
      render={
        <SettingsRow
          icon={<AiProviderIcon provider={name} className="size-5" />}
          iconVariant="avatar"
          title={name}
          description={
            <>
              Key ending in{' '}
              <span data-mask className="font-mono">
                {end}
              </span>
              {provider === 'openrouter' && ', serves every model'}
            </>
          }
        />
      }
    >
      <Switch
        size="sm"
        aria-label={`Use ${name}`}
        checked={toggle.isPending ? toggle.variables.enabled : enabled}
        onCheckedChange={(next) => toggle.mutate({ enabled: next, provider })}
      />
      <AppMenuButton variant="muted" items={items} />
    </AppContextMenu>
  )
}

const AddProvider = ({
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

export const AiProviders = ({ aiKeys }: { aiKeys: SavedAiKey[] }) => {
  const hasAccount = useHasAccount()
  const [editing, setEditing] = useState<AiKeyProvider | null>(null)
  const isSaved = (provider: AiKeyProvider) =>
    aiKeys.some((aiKey) => aiKey.provider === provider)
  const available = objectEntries(AI_KEY_PROVIDERS).filter(
    ([provider]) => !isSaved(provider)
  )
  const add = (provider: AiKeyProvider) =>
    hasAccount
      ? setEditing(provider)
      : promptSignIn('AI features need an account.')

  return (
    <>
      <SettingsGroup
        title="Your providers"
        action={
          aiKeys.length > 0 &&
          available.length > 0 && (
            <AddProvider
              providers={available}
              onPick={add}
              trigger={
                <Button
                  size="icon-xs"
                  variant="ghost-muted"
                  aria-label="Add provider"
                />
              }
            >
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            </AddProvider>
          )
        }
      >
        {aiKeys.map((aiKey) => (
          <ProviderRow
            key={aiKey.provider}
            aiKey={aiKey}
            onReplace={() => setEditing(aiKey.provider)}
          />
        ))}
        {aiKeys.length === 0 && (
          <SettingsRow
            title="No providers yet"
            description="Connect one with your API key, and the AI chat runs on its models, billed by the provider instead of Tamery, on any plan."
          >
            <AddProvider
              providers={available}
              onPick={add}
              trigger={<Button size="sm" variant="outline" />}
            >
              Add provider
            </AddProvider>
          </SettingsRow>
        )}
      </SettingsGroup>
      <AiKeyDialog
        provider={editing}
        replaces={!!editing && isSaved(editing)}
        onClose={() => setEditing(null)}
      />
    </>
  )
}
