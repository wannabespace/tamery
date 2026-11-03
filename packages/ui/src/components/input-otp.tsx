import { MinusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@tamery/ui/lib/utils'
import { OTPInput, OTPInputContext } from 'input-otp'
import * as React from 'react'

const InputOTP = ({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string
}) => (
  <OTPInput
    data-slot="input-otp"
    containerClassName={cn(
      `flex w-full items-center has-disabled:opacity-50`,
      containerClassName
    )}
    spellCheck={false}
    className={cn('disabled:cursor-not-allowed', className)}
    {...props}
  />
)

const InputOTPGroup = ({
  className,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    data-slot="input-otp-group"
    className={cn(`flex flex-1 items-center gap-2`, className)}
    {...props}
  />
)

const InputOTPSlot = ({
  index,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  index: number
}) => {
  const inputOTPContext = React.use(OTPInputContext)
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {}

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        `bg-input ring-foreground/4 data-[active=true]:focus-ring aria-invalid:invalid-ring relative flex h-10 min-w-0 flex-1 items-center justify-center rounded-xl text-base font-medium shadow-xs ring transition-shadow duration-200 outline-none`,
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="animate-caret-blink bg-foreground h-4 w-px duration-1000" />
        </div>
      )}
    </div>
  )
}

const InputOTPSeparator = ({
  className,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    data-slot="input-otp-separator"
    className={cn(
      "flex items-center [&_svg:not([class*='size-'])]:size-4",
      className
    )}
    {...props}
  >
    <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} />
  </div>
)

export { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot }
