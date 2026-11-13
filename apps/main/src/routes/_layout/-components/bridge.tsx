import {
  ComputerIcon,
  Key01Icon,
  SquareLock02Icon,
} from '@hugeicons/core-free-icons'
import { InlineCode } from '@tamery/ui/components/custom/inline-code'

import { Chapter } from '~/components/chapter'
import { DocsLink } from '~/components/docs-link'
import { FactRow } from '~/components/fact-row'
import { Reveal } from '~/components/reveal'

import { BridgeDemo } from './bridge-demo/bridge-demo'

const FACTS = [
  {
    description:
      'Localhost, a private network or a SQLite file: the bridge reaches whatever its computer can.',
    icon: ComputerIcon,
    title: 'Runs where your data is',
  },
  {
    description:
      'A new browser runs nothing until you allow it in your terminal. Nothing else can use the bridge.',
    icon: SquareLock02Icon,
    title: 'You allow each browser',
  },
  {
    description:
      'Connections synced without their password ask for it once, then run from your computer.',
    icon: Key01Icon,
    title: 'Passwords can stay with you',
  },
]

export const Bridge = () => (
  <Chapter
    id="cli"
    number="07"
    label="CLI"
    title="Your localhost, in the browser."
    subtitle="One command on your computer."
    description={
      <>
        Run <InlineCode>tamery bridge</InlineCode> and the web app queries
        databases your computer can reach, through your computer instead of
        Tamery’s servers.
      </>
    }
    actions={
      <DocsLink path="/cli/overview" source="cli">
        Set up the bridge
      </DocsLink>
    }
  >
    <Reveal className="mt-12">
      <BridgeDemo />
    </Reveal>
    <FactRow facts={FACTS} />
  </Chapter>
)
