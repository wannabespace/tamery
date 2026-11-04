import {
  ArrowDown01Icon,
  Shield01Icon,
  SecurityBlockIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tamery/ui/components/collapsible'
import { SettingsRow } from '@tamery/ui/components/custom/settings-group'
import { Item, ItemMedia } from '@tamery/ui/components/item'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { authClient } from '~/lib/auth'
import { handleError } from '~/utils/error'

import { ConfirmAction } from '../confirm-action'
import { BackupCodesDialog } from './enable-tfa-dialog'
import { useReloadTwoFactor } from './two-factor-methods'

export const MoreOptions = () => {
  const reloadTwoFactor = useReloadTwoFactor()
  const [codesOpen, setCodesOpen] = useState(false)

  const {
    mutate: regenerate,
    isPending: isRegenerating,
    data: regenerated,
  } = useMutation({
    meta: { event: 'backup_codes_regenerated' },
    mutationFn: () =>
      authClient.twoFactor.generateBackupCodes({
        fetchOptions: { throw: true },
      }),
    onError: handleError,
    onSuccess: () => setCodesOpen(true),
  })

  const { mutate: disable, isPending: isDisabling } = useMutation({
    meta: { event: 'two_factor_disabled' },
    mutationFn: () =>
      authClient.twoFactor.disable({ fetchOptions: { throw: true } }),
    onError: handleError,
    onSuccess: async () => {
      toast.success('2FA disabled')
      await reloadTwoFactor()
    },
  })

  return (
    <Collapsible>
      <BackupCodesDialog
        codes={regenerated?.backupCodes ?? []}
        open={codesOpen}
        onOpenChange={setCodesOpen}
      />
      <Item
        size="sm"
        variant="grouped"
        render={<CollapsibleTrigger variant="disclosure" />}
      >
        <ItemMedia>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            className="size-4 transition-transform duration-100 group-data-panel-open/item:rotate-180"
          />
        </ItemMedia>
        More options
      </Item>
      <CollapsibleContent className="ease-house h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 data-ending-style:h-0 data-starting-style:h-0">
        <SettingsRow
          icon={
            <HugeiconsIcon
              icon={Shield01Icon}
              strokeWidth={2}
              className="size-4"
            />
          }
          title="Backup codes"
          description="Single-use codes in case you lose your authenticator app."
        >
          <ConfirmAction
            action="Regenerate"
            title="Regenerate backup codes?"
            description="Your current backup codes stop working."
            isPending={isRegenerating}
            onConfirm={(close) => regenerate(undefined, { onSuccess: close })}
          />
        </SettingsRow>
        <SettingsRow
          icon={
            <HugeiconsIcon
              icon={SecurityBlockIcon}
              strokeWidth={2}
              className="size-4"
            />
          }
          title="Disable two-factor authentication"
          description="Stops asking for a second factor at sign-in. Your backup codes stop working."
        >
          <ConfirmAction
            action="Disable"
            title="Disable two-factor authentication?"
            description="Sign-in will no longer ask for a second factor, and your backup codes stop working."
            isPending={isDisabling}
            onConfirm={(close) => disable(undefined, { onSuccess: close })}
          />
        </SettingsRow>
      </CollapsibleContent>
    </Collapsible>
  )
}
