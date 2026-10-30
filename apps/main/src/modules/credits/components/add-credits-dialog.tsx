import { CREDIT_TOP_UP } from '@tamery/shared/credits'
import { Button } from '@tamery/ui/components/button'
import { ButtonGroup } from '@tamery/ui/components/button-group'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tamery/ui/components/dialog'
import { Field, FieldLabel } from '@tamery/ui/components/field'
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
} from '@tamery/ui/components/number-field'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { orpc } from '~/lib/orpc'

import { formatDollars } from '../format'

/** Picks an amount and hands off to Stripe Checkout, which also saves the card for auto top-up. */
export const AddCreditsDialog = ({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}) => {
  const router = useRouter()
  const [amount, setAmount] = useState<number | null>(CREDIT_TOP_UP.amounts[1])
  const valid =
    amount !== null &&
    Number.isInteger(amount) &&
    amount >= CREDIT_TOP_UP.min &&
    amount <= CREDIT_TOP_UP.max
  const returnUrl = (credits: 'success' | 'cancel') =>
    location.origin +
    router.buildLocation({ search: { credits }, to: '/account/credits' }).href
  const { isPending, mutate: checkout } = useMutation({
    meta: { event: 'ai_credits_checkout_started' },
    mutationFn: async (dollars: number) => {
      const { url } = await orpc.account.credits.topUp.call({
        amount: dollars,
        cancelUrl: returnUrl('cancel'),
        successUrl: returnUrl('success'),
      })
      location.assign(url)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Credits</DialogTitle>
          <DialogDescription>
            Credits pay for the AI chat once the month&apos;s included amount is
            used, at what the model costs us. They never expire.
          </DialogDescription>
        </DialogHeader>
        <ButtonGroup>
          {CREDIT_TOP_UP.amounts.map((preset) => (
            <Button
              key={preset}
              variant={amount === preset ? 'default' : 'outline'}
              onClick={() => setAmount(preset)}
            >
              {formatDollars(preset)}
            </Button>
          ))}
        </ButtonGroup>
        <Field>
          <FieldLabel htmlFor="credits-amount">Amount in US dollars</FieldLabel>
          <NumberField
            id="credits-amount"
            value={amount}
            min={CREDIT_TOP_UP.min}
            max={CREDIT_TOP_UP.max}
            step={1}
            onValueChange={setAmount}
          >
            <NumberFieldGroup>
              <NumberFieldInput />
            </NumberFieldGroup>
          </NumberField>
        </Field>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            disabled={!valid || isPending}
            onClick={() => amount !== null && checkout(amount)}
          >
            <LoadingContent loading={isPending}>
              {valid ? `Pay ${formatDollars(amount)}` : 'Pay'}
            </LoadingContent>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
