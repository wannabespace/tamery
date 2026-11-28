import { Delete02Icon, PencilEdit01Icon } from '@hugeicons/core-free-icons'
import { AI_KEY_PROVIDERS } from '@tamery/shared/ai-key'
import { SettingsRow } from '@tamery/ui/components/custom/settings-group'
import { AiProviderIcon } from '@tamery/ui/components/icons/ai-provider-icon'
import { Switch } from '@tamery/ui/components/switch'
import { useMutation } from '@tanstack/react-query'

import { AppContextMenu, AppMenuButton } from '~/components/app-context-menu'
import type { AppMenuNode } from '~/components/app-menu'
import type { ORPCOutputs } from '~/lib/orpc'
import { orpc } from '~/lib/orpc'

import { refreshAi } from './refresh-ai'

export type SavedAiKey = ORPCOutputs['account']['aiKey']['list'][number]

export const ProviderRow = ({
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
