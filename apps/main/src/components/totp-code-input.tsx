import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@tamery/ui/components/input-otp'
import { Spinner } from '@tamery/ui/components/spinner'
import type { ComponentProps } from 'react'

const TOTP_LENGTH = 6
const TOTP_SLOTS = Array.from({ length: TOTP_LENGTH }, (_, i) => ({
  index: i,
  key: `slot-${i}`,
}))

export const TotpCodeInput = ({
  loading = false,
  ...props
}: { loading?: boolean; 'aria-label': string } & Omit<
  ComponentProps<typeof InputOTP>,
  'maxLength' | 'children' | 'render' | 'disabled'
>) => (
  <div className="relative w-full">
    <InputOTP maxLength={TOTP_LENGTH} disabled={loading} {...props}>
      <InputOTPGroup>
        {TOTP_SLOTS.map((slot) => (
          <InputOTPSlot key={slot.key} index={slot.index} />
        ))}
      </InputOTPGroup>
    </InputOTP>
    {loading && (
      <span className="text-muted-foreground absolute inset-0 flex items-center justify-center">
        <Spinner />
      </span>
    )}
  </div>
)
