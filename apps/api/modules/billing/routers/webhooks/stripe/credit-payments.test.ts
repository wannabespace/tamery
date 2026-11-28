import { beforeEach, expect, mock, test } from 'bun:test'

import { topUpChargeCents } from '@tamery/shared/credits'
import type Stripe from 'stripe'

const credit = mock(() => Promise.resolve())
const failAutoTopUp = mock(() => Promise.resolve())
let credited = true
const reverse = mock(() => Promise.resolve(credited))
mock.module('../../../credits', () => ({
  CREDITS_PAYMENT_KIND: 'ai_credits',
  credits: { credit, failAutoTopUp, reverse },
}))

const retrieveIntent = mock(() =>
  Promise.resolve({ metadata: { kind: 'ai_credits' } })
)
const retrieveCharge = mock(() =>
  Promise.resolve({ amount: 1050, amount_refunded: 525 })
)
let disputeStatus = 'needs_response'
mock.module('~/lib/stripe', () => ({
  stripe: {
    charges: { retrieve: retrieveCharge },
    disputes: {
      retrieve: () => Promise.resolve({ status: disputeStatus }),
    },
    paymentIntents: { retrieve: retrieveIntent },
  },
}))

const { creditPayments } = await import('./credit-payments')

const event = (type: Stripe.Event.Type, object: object) =>
  ({ data: { object }, type }) as unknown as Stripe.Event

const intent = (overrides: object = {}) => ({
  amount_received: topUpChargeCents(10),
  currency: 'usd',
  id: 'pi_1',
  metadata: { amount: '10', kind: 'ai_credits', userId: 'user-1' },
  payment_method: 'pm_card',
  ...overrides,
})

beforeEach(() => {
  credit.mockClear()
  failAutoTopUp.mockClear()
  reverse.mockClear()
  credited = true
})

test('a paid top-up credits what was bought, with its card', async () => {
  await creditPayments(event('payment_intent.succeeded', intent()))

  expect(credit).toHaveBeenCalledWith({
    amount: 10,
    attemptId: null,
    paymentIntentId: 'pi_1',
    paymentMethodId: 'pm_card',
    userId: 'user-1',
  })
})

test('a payment that received less than the charge credits nothing', async () => {
  await expect(
    creditPayments(
      event('payment_intent.succeeded', intent({ amount_received: 100 }))
    )
  ).rejects.toThrow('received 100 usd')
  await expect(
    creditPayments(
      event('payment_intent.succeeded', intent({ currency: 'eur' }))
    )
  ).rejects.toThrow('eur')
  expect(credit).not.toHaveBeenCalled()
})

test('a payment that is not for credits is ignored', async () => {
  await creditPayments(
    event('payment_intent.succeeded', intent({ metadata: { kind: 'other' } }))
  )

  expect(credit).not.toHaveBeenCalled()
})

test('a failed automatic top-up ends its attempt', async () => {
  await creditPayments(
    event(
      'payment_intent.payment_failed',
      intent({
        metadata: {
          amount: '10',
          attemptId: 'attempt-1',
          kind: 'ai_credits',
          userId: 'user-1',
        },
      })
    )
  )

  expect(failAutoTopUp).toHaveBeenCalledWith('user-1', 'attempt-1')
})

test('a refund takes back its share and a dispute the whole top-up', async () => {
  await creditPayments(
    event('charge.refunded', {
      amount: 1050,
      amount_refunded: 525,
      payment_intent: 'pi_1',
    })
  )
  await creditPayments(
    event('charge.dispute.created', {
      id: 'dp_1',
      payment_intent: { id: 'pi_2' },
    })
  )

  expect(reverse.mock.calls).toEqual([
    ['pi_1', 0.5, false],
    ['pi_2', 1, false],
  ] as never)
})

test('a refund before the payment is credited fails so Stripe sends it again', async () => {
  credited = false
  const refund = event('charge.refunded', {
    amount: 1050,
    amount_refunded: 1050,
    payment_intent: 'pi_1',
  })

  await expect(creditPayments(refund)).rejects.toThrow('not credited yet')
  retrieveIntent.mockResolvedValueOnce({ metadata: { kind: 'other' } })
  await creditPayments(refund)
})

test('a won dispute gives back what was not refunded', async () => {
  await creditPayments(
    event('charge.dispute.closed', {
      charge: 'ch_1',
      payment_intent: 'pi_1',
      status: 'lost',
    })
  )
  await creditPayments(
    event('charge.dispute.closed', {
      charge: 'ch_1',
      payment_intent: 'pi_1',
      status: 'won',
    })
  )

  expect(retrieveCharge).toHaveBeenCalledWith('ch_1')
  expect(reverse.mock.calls).toEqual([['pi_1', 0.5, true]] as never)
})

test('a dispute created again after it was won takes nothing back', async () => {
  disputeStatus = 'won'
  await creditPayments(
    event('charge.dispute.created', {
      id: 'dp_1',
      payment_intent: { id: 'pi_1' },
    })
  )
  disputeStatus = 'needs_response'

  expect(reverse).not.toHaveBeenCalled()
})
