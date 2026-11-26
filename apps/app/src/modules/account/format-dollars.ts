export const formatDollars = (amount: number) =>
  new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(
    amount
  )
