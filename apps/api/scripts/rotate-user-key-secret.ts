import { env } from '@tamery/db/env'
import { userEncryptionKeys } from '@tamery/db/schema'

import { runColumnKeyRotation } from './column-key-rotation'

// USER_KEY_SECRET wraps every per-user connection key in user_encryption_keys.
await runColumnKeyRotation({
  columns: [
    { cipher: userEncryptionKeys.secret, id: userEncryptionKeys.userId },
  ],
  oldSecret: env.USER_KEY_SECRET,
  secretName: 'USER_KEY_SECRET',
})
