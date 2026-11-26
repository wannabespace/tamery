import { HOBBY_PLAN, PAID_PLANS, TEAM_PLAN } from '@tamery/shared/plans'
import { Button } from '@tamery/ui/components/button'
import { Tabs, TabsList, TabsTrigger } from '@tamery/ui/components/tabs'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { Chapter } from '~/components/chapter'
import { Reveal } from '~/components/reveal'
import { useSubscription } from '~/hooks/use-subscription'
import { authClient } from '~/lib/auth'

import { ContactSalesDialog } from './contact-sales-dialog'
import { PlanCard } from './plan-card'
import type { Period } from './price'
import { Price } from './price'

const PLAN_SETTINGS_URL = `${import.meta.env.VITE_PUBLIC_WEB_URL}/settings/plan`

const ENTERPRISE_FEATURES = [
  'Volume pricing and custom terms',
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
      <Reveal className="mt-16 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PlanCard
          name={HOBBY_PLAN.name}
          description={HOBBY_PLAN.description}
          features={HOBBY_PLAN.features}
          includes={HOBBY_PLAN.includes}
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
        {PAID_PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            highlighted={plan.highlighted}
            name={plan.name}
            description={plan.description}
            features={plan.features}
            includes={plan.includes}
            price={<Price period={period} plan={plan} />}
            action={
              <Button
                size="lg"
                variant={plan.highlighted ? 'default' : 'outline'}
                render={
                  session ? (
                    <a
                      href={PLAN_SETTINGS_URL}
                      aria-label={
                        subscription ? 'Manage plan' : 'Try free for 7 days'
                      }
                    />
                  ) : (
                    <Link to="/sign-in" />
                  )
                }
              >
                {subscription ? 'Manage plan' : 'Try free for 7 days'}
              </Button>
            }
          />
        ))}
        <PlanCard
          name="Enterprise"
          description="Tamery across your company, on your terms"
          features={ENTERPRISE_FEATURES}
          includes={TEAM_PLAN.name}
          price={<span className="text-4xl leading-none">Custom</span>}
          action={<ContactSalesDialog />}
        />
      </Reveal>
    </Chapter>
  )
}
