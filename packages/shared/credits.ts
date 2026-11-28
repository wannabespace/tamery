/** The Pro subscription. */
export const PRO_PRICE_USD = { monthly: 15, yearly: 150 } as const

export const PRO_TRIAL_DAYS = 7

/** What Pro's AI may cost in models each paid period, every AI feature together; a trial gets the same. Past it, AI credits pay. */
export const PRO_INCLUDED_AI_USD = 5

/** AI credits are US dollars of model cost, 1:1, bought by Pro users once the month's included budget is spent; they never expire. Each top-up charges `fee` on top of the credits it adds. */
export const CREDIT_TOP_UP = {
  amounts: [10, 25, 50, 100],
  autoTopUpAmount: 20,
  autoTopUpThreshold: 5,
  fee: 0.05,
  max: 1000,
  min: 10,
} as const

/** What a top-up of `credits` dollars charges, in cents. */
export const topUpChargeCents = (credits: number) =>
  Math.round(credits * (1 + CREDIT_TOP_UP.fee) * 100)

/** What any AI feature answers once the month's included budget and the credits are spent; the app matches it to offer Add credits. */
export const AI_BUDGET_SPENT_MESSAGE =
  "You've used this month's included AI budget and your credits. Add credits or turn on auto top-up to keep going."

// TOO_MANY_REQUESTS also answers the free plan's weekly limit, so only the message tells a spent budget.

export const isBudgetSpent = (error: Error) =>
  error.message === AI_BUDGET_SPENT_MESSAGE
