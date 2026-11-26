import { Button } from '@tamery/ui/components/button'
import { Tabs, TabsList, TabsTrigger } from '@tamery/ui/components/tabs'
import { cn } from '@tamery/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { Chapter } from '~/components/chapter'
import { Reveal } from '~/components/reveal'
import { useSubscription } from '~/hooks/use-subscription'
import { authClient } from '~/lib/auth'
import { pageCardClass } from '~/utils/card'
import { HOBBY_PLAN, PAID_PLANS, TEAM_PLAN } from '~/utils/pricing'

import { ContactSalesDialog } from './contact-sales-dialog'
import { PlanCard, PlanFeatures } from './plan-card'
import type { Period } from './price'
import { Price } from './price'

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
      <Reveal className="mt-16 grid gap-4 lg:grid-cols-3">
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
                    <Link to="/account" search={{ period, plan: plan.id }} />
                  ) : (
                    <Link
                      to="/sign-in"
                      search={{
                        redirectPath: `/account?${new URLSearchParams({ period, plan: plan.id })}`,
                      }}
                    />
                  )
                }
              >
                {subscription ? 'Manage plan' : 'Try free for 7 days'}
              </Button>
            }
          />
        ))}
        <article
          className={cn(
            pageCardClass,
            'grid gap-6 p-6 sm:p-8 md:grid-cols-[1fr_auto] lg:col-span-3 lg:grid-cols-subgrid lg:gap-x-20'
          )}
        >
          <div>
            <h3 className="font-medium">Enterprise</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Tamery across your company, on your terms.
            </p>
          </div>
          <PlanFeatures
            features={ENTERPRISE_FEATURES}
            includes={TEAM_PLAN.name}
          />
          <div className="grid md:col-start-2 md:row-start-1 lg:col-start-3 lg:justify-end">
            <ContactSalesDialog />
          </div>
        </article>
      </Reveal>
    </Chapter>
  )
}
