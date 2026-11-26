import type { AiKeyProvider } from '@tamery/shared/ai-key'
import { Dialog, DialogContent } from '@tamery/ui/components/dialog'
import { useState } from 'react'

import { AiKeyForm } from './ai-key-form'

export const AiKeyDialog = ({
  onClose,
  provider,
  replaces,
}: {
  onClose: () => void
  provider: AiKeyProvider | null
  replaces: boolean
}) => {
  const [shown, setShown] = useState<{
    provider: AiKeyProvider
    replaces: boolean
  } | null>(null)
  // Saving a key turns it into a replacement while the dialog still fades, so the mode is copied with the provider.
  if (provider && provider !== shown?.provider) {
    setShown({ provider, replaces })
  }

  return (
    <Dialog
      open={!!provider}
      onOpenChange={(open) => !open && onClose()}
      onOpenChangeComplete={(open) => !open && setShown(null)}
    >
      {shown && (
        <DialogContent>
          <AiKeyForm onSaved={onClose} {...shown} />
        </DialogContent>
      )}
    </Dialog>
  )
}
