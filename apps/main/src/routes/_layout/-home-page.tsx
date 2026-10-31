import { Explore, Query, Share } from '~/modules/features/features'
import { Pricing } from '~/modules/pricing/pricing'

import { Agents } from './-components/agents'
import { Engines } from './-components/engines'
import { Faq } from './-components/faq'
import { GetStarted } from './-components/get-started'
import { Hero } from './-components/hero'
import { Security } from './-components/security'

export const HomePage = () => (
  <main>
    <Hero />
    <Engines />
    <Explore />
    <Query />
    <Agents />
    <Share />
    <Security />
    <Pricing />
    <Faq />
    <GetStarted />
  </main>
)
