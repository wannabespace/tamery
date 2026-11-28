import { PASSKEY_ERROR_CODES } from '@better-auth/passkey/client'
import type { WebAuthnErrorCode } from '@simplewebauthn/browser'

// A dismissed or timed-out browser prompt reports NotAllowedError, which arrives as the passthrough code, not AUTH_CANCELLED.
const PASSKEY_DISMISSED_CODES = new Set<string>([
  PASSKEY_ERROR_CODES.AUTH_CANCELLED.code,
  ...([
    'ERROR_CEREMONY_ABORTED',
    'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY',
  ] satisfies WebAuthnErrorCode[]),
])

export const isPasskeyPromptDismissed = ({ code }: { code?: string }) =>
  code !== undefined && PASSKEY_DISMISSED_CODES.has(code)
