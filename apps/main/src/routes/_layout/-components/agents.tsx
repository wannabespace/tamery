import {
  Key01Icon,
  SquareLock02Icon,
  ViewIcon,
} from '@hugeicons/core-free-icons'

import { Chapter } from '~/components/chapter'
import { DocsLink } from '~/components/docs-link'
import { FactRow } from '~/components/fact-row'
import { Reveal } from '~/components/reveal'

import { AgentDemo } from './agent-demo/agent-demo'

const POINTS = [
  {
    description:
      'Agents list tables, describe them and run read-only queries without asking.',
    icon: ViewIcon,
    title: 'Reads run freely',
  },
  {
    description:
      'Every write opens a dialog in Tamery. Nothing the agent sent runs before you press Run.',
    icon: SquareLock02Icon,
    title: 'Writes wait for you',
  },
  {
    description:
      'Agents get a token, never your connection strings. Pick what each connection allows.',
    icon: Key01Icon,
    title: 'Strings stay in Tamery',
  },
]

export const Agents = () => (
  <Chapter
    id="agents"
    number="03"
    label="Agents"
    title="Your agents query."
    subtitle="You approve the writes."
    description="Claude Code, Cursor and other MCP clients reach your databases through the desktop app. By default, every write waits for your approval."
    actions={
      <DocsLink path="/mcp/overview" source="agents">
        Connect an agent
      </DocsLink>
    }
  >
    <Reveal className="mt-12">
      <AgentDemo />
    </Reveal>
    <FactRow facts={POINTS} />
  </Chapter>
)
