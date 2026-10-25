import { ScrollArea } from '@tamery/ui/components/scroll-area'

import { useConnectionContext } from '~/core/connection/route'
import { openTab } from '~/core/tabs/actions'
import { definitionsTabId } from '~/core/tabs/ids'
import type { TabView } from '~/core/tabs/types'

import { DefinitionsRefresh } from './definitions-refresh'
import type { DefinitionsParams } from './lib/tab'
import { Constraints } from './sections/constraints'
import { Enums } from './sections/enums'
import { Functions } from './sections/functions'
import { Indexes } from './sections/indexes'
import { Policies } from './sections/policies/policies'
import { Privileges } from './sections/privileges'
import { Triggers } from './sections/triggers/triggers'

const SECTIONS = {
  constraints: Constraints,
  enums: Enums,
  functions: Functions,
  indexes: Indexes,
  policies: Policies,
  privileges: Privileges,
  triggers: Triggers,
}

const DefinitionsTab = ({
  params: { section },
}: {
  params: DefinitionsParams
}) => {
  const { connectionResource } = useConnectionContext()
  const Section = SECTIONS[section]

  return (
    <ScrollArea
      className="min-h-0 flex-1"
      onClick={() => openTab(connectionResource.id, definitionsTabId(section))}
    >
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-3 px-6 py-5">
        <Section />
      </div>
    </ScrollArea>
  )
}

export const definitionsView: TabView<DefinitionsParams> = {
  Content: DefinitionsTab,
  Refresh: DefinitionsRefresh,
}
