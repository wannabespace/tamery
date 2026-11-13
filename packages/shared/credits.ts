/** The Pro subscription; its monthly price is also what its chat may cost in models each month. */
export const PRO_PRICE_USD = { monthly: 10, yearly: 100 } as const

export const PRO_TRIAL_DAYS = 7

/** AI credits are US dollars of model cost, 1:1, bought by Pro users once the month's included budget is spent; they never expire. */
export const CREDIT_TOP_UP = {
  amounts: [10, 25, 50, 100],
  autoTopUpAmount: 20,
  autoTopUpThreshold: 5,
  max: 1000,
  min: 5,
} as const

/** What the chat answers once the month's included budget and the credits are spent; the app matches it to offer Add credits. */
export const CHAT_BUDGET_SPENT_MESSAGE =
  "You've used this month's included AI chat budget and your credits. Add credits or turn on auto top-up to keep going."
