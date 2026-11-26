import { downloadFile } from '@tamery/shared/files'
import { Button } from '@tamery/ui/components/button'
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tamery/ui/components/dialog'
import { copy } from '@tamery/ui/lib/copy'

import { posthog } from '~/lib/posthog'

export const BackupCodes = ({
  codes,
  onDone,
}: {
  codes: string[]
  onDone: () => void
}) => (
  <>
    <DialogHeader>
      <DialogTitle>Save your backup codes</DialogTitle>
      <DialogDescription>
        Each code signs you in once if you lose your authenticator app. They
        won&apos;t be shown again.
      </DialogDescription>
    </DialogHeader>
    <div data-mask className="grid grid-cols-2 gap-2 font-mono text-sm">
      {codes.map((code) => (
        <span key={code}>{code}</span>
      ))}
    </div>
    <DialogFooter>
      <Button
        variant="outline"
        onClick={() => copy(codes.join('\n'), 'Backup codes copied')}
      >
        Copy
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          downloadFile(
            codes.join('\n'),
            'tamery-backup-codes.txt',
            'text/plain'
          )
          posthog.capture('backup_codes_downloaded')
        }}
      >
        Download
      </Button>
      <Button onClick={onDone}>Done</Button>
    </DialogFooter>
  </>
)
