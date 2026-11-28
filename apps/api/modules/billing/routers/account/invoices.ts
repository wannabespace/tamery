import { db } from '@tamery/db'
import { users } from '@tamery/db/schema'
import { eq } from 'drizzle-orm'
import type Stripe from 'stripe'

import { stripe } from '~/lib/stripe'
import { authMiddleware, orpc } from '~/orpc'

export type InvoiceStatus = Extract<Stripe.Invoice.Status, string>

export const invoices = orpc
  .use(authMiddleware)
  .errors({
    NOT_FOUND: { message: 'User not found' },
  })
  .handler(async ({ context, errors }) => {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, context.user.id))

    if (!user) {
      throw errors.NOT_FOUND()
    }

    if (!user.stripeCustomerId) {
      return []
    }

    const invoiceList = await stripe?.invoices.list({
      customer: user.stripeCustomerId,
    })

    return (
      invoiceList?.data.map((invoice) => ({
        amount: invoice.amount_paid,
        createdAt: new Date(invoice.created * 1000),
        id: invoice.id,
        status: invoice.status as InvoiceStatus | null,
        url: invoice.hosted_invoice_url,
      })) ?? []
    )
  })
