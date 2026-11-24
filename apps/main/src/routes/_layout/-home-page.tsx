import { Explore } from '~/modules/features/explore'
import { Query } from '~/modules/features/query'
import { Share } from '~/modules/features/share'
import { Pricing } from '~/modules/pricing/pricing'

import { Agents } from './-components/agents'
import { Engines } from './-components/engines'
import { Faq } from './-components/faq'
import { GetStarted } from './-components/get-started'
import { Hero } from './-components/hero'
import { Machine } from './-components/machine'
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
    <Machine />
    <Pricing />
    <Faq />
    <GetStarted />
  </main>
)
