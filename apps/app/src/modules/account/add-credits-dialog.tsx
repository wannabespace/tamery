import { CREDIT_TOP_UP, topUpChargeCents } from '@tamery/shared/credits'
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
  DialogTrigger,
} from '@tamery/ui/components/dialog'
import { Field, FieldLabel } from '@tamery/ui/components/field'
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
} from '@tamery/ui/components/number-field'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { orpc } from '~/lib/orpc'

import { formatDollars } from './format-dollars'
import { openStripe, stripeReturnUrl } from './stripe'

export const AddCreditsDialog = () => {
  const [amount, setAmount] = useState<number | null>(CREDIT_TOP_UP.amounts[1])
  const valid =
    amount !== null &&
    Number.isInteger(amount) &&
    amount >= CREDIT_TOP_UP.min &&
    amount <= CREDIT_TOP_UP.max
  const { isPending, mutate: checkout } = useMutation({
    meta: { event: 'ai_credits_checkout_started' },
    mutationFn: (dollars: number) =>
      orpc.account.credits.topUp.call({
        amount: dollars,
        cancelUrl: stripeReturnUrl('ai'),
        successUrl: stripeReturnUrl('ai'),
      }),
    onSuccess: openStripe,
  })

  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        Add credits
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Credits</DialogTitle>
          <DialogDescription>
            Credits pay for AI once the month&apos;s included amount is used, at
            what the model costs us. Each top-up adds a{' '}
            {CREDIT_TOP_UP.fee * 100}% fee. Credits never expire.
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
              {valid
                ? `Pay ${formatDollars(topUpChargeCents(amount) / 100)}`
                : 'Pay'}
            </LoadingContent>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
