import { CONTACT_EMAIL } from '@tamery/shared/constants'
import type { ComponentProps } from 'react'
import type { CreateEmailOptions } from 'resend'
import { Resend } from 'resend'

import { env } from '~/env'

import { redis, redisMemoize } from '../redis'
import * as templatesNamespace from './templates'

const templates = { ...templatesNamespace }

export const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

// Anyone can make the API fail a request, and alerts share the Resend quota that sign-in codes need.
const ALERTS_PER_MINUTE = 10

export const sendEmail = async <
  T extends keyof typeof templates,
  P extends ComponentProps<(typeof templates)[T]>,
>({
  to,
  subject,
  template,
  props,
}: {
  to: string
  subject: string
  template: T
} & (keyof P extends never ? { props?: never } : { props: P })) => {
  if (!resend) {
    console.error('Resend email service is not configured.', {
      props,
      subject,
      template,
      to,
    })
    return
  }

  // Never throws: auth database hooks send mid-operation, and a Redis or Resend failure must not leave e.g. 2FA half-disabled.
  try {
    if (template === 'Alert') {
      const key = `resend:alerts:${Math.floor(Date.now() / 60_000)}`
      const sent = await redis.incr(key)
      if (sent === 1) {
        await redis.expire(key, 60)
      }
      if (sent > ALERTS_PER_MINUTE) {
        return
      }
    }

    const Template = templates[template] as (props?: P) => React.ReactElement
    const options: CreateEmailOptions = {
      from: `Tamery <${CONTACT_EMAIL}>`,
      react: Template(props),
      subject,
      to,
    }

    await redisMemoize(
      async () => {
        const { error } = await resend.emails.send(options)

        if (error) {
          throw error
        }
      },
      `resend:${JSON.stringify(options)}`,
      10 * 60
    )
  } catch (error) {
    console.error(
      'Resend email service error:',
      error instanceof Error ? error.message : 'Unknown error',
      error
    )
  }
}
