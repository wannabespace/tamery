import { env } from '@tamery/db/env'
import { workspaceEncryptionKeys } from '@tamery/db/schema'

import { runColumnKeyRotation } from './column-key'

// USER_KEY_SECRET wraps every per-workspace connection key in workspace_encryption_keys.
await runColumnKeyRotation({
  columns: [
    {
      cipher: workspaceEncryptionKeys.secret,
      id: workspaceEncryptionKeys.workspaceId,
    },
  ],
  secretName: 'USER_KEY_SECRET',
  secrets: env.USER_KEY_SECRET,
})
