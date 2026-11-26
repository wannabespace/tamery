import { Dialog, DialogContent } from '@tamery/ui/components/dialog'

import { BackupCodes } from './backup-codes'

export const BackupCodesDialog = ({
  codes,
  onOpenChange,
  open,
}: {
  codes: string[]
  onOpenChange: (open: boolean) => void
  open: boolean
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-xs">
      <BackupCodes codes={codes} onDone={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>
)
