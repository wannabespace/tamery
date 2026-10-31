import { Button } from '@tamery/ui/components/button'
import { Tabs, TabsList, TabsTrigger } from '@tamery/ui/components/tabs'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { Chapter } from '~/components/chapter'
import { Reveal } from '~/components/reveal'
import { useSubscription } from '~/hooks/use-subscription'
import { authClient } from '~/lib/auth'
import { HOBBY_PLAN, PRO_PLAN } from '~/utils/pricing'

import { ContactSalesDialog } from './contact-sales-dialog'
import { PlanCard } from './plan-card'
import type { Period } from './price'
import { Price } from './price'

const ENTERPRISE_FEATURES = [
  'Volume pricing on one invoice',
  'Priority support from the people who build it',
  'Self-hosting help (AGPL-3.0)',
]

export const Pricing = () => {
  const { data: session } = authClient.useSession()
  const subscription = useSubscription()
  const [period, setPeriod] = useState<Period>('monthly')

  return (
    <Chapter
      id="pricing"
      label="Pricing"
      title="Start free."
      subtitle="Upgrade when you outgrow it."
      actions={
        <Tabs value={period} onValueChange={setPeriod}>
          <TabsList aria-label="Billing period">
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="yearly">Yearly, 2 months free</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      <Reveal className="mt-16 grid gap-4 lg:grid-cols-3">
        <PlanCard
          name={HOBBY_PLAN.name}
          description={HOBBY_PLAN.description}
          features={HOBBY_PLAN.features}
          price={<Price period={period} plan={HOBBY_PLAN} />}
          action={
            <Button
              size="lg"
              variant="outline"
              render={<Link to="/download" />}
            >
              Download
            </Button>
          }
        />
        <PlanCard
          highlighted
          name={PRO_PLAN.name}
          description={PRO_PLAN.description}
          features={PRO_PLAN.features}
          includes={HOBBY_PLAN.name}
          price={<Price period={period} plan={PRO_PLAN} />}
          action={
            subscription ? (
              <Button size="lg" render={<Link to="/account" />}>
                Manage plan
              </Button>
            ) : (
              <Button
                size="lg"
                render={
                  <Link
                    to={session ? '/account' : '/sign-in'}
                    search={{ period }}
                  />
                }
              >
                Try free for 7 days
              </Button>
            )
          }
        />
        <PlanCard
          name="Enterprise"
          description="Tamery for your whole team, on your terms"
          features={ENTERPRISE_FEATURES}
          includes={PRO_PLAN.name}
          price={<span className="text-4xl leading-none">Custom</span>}
          action={<ContactSalesDialog />}
        />
      </Reveal>
    </Chapter>
  )
}
