import { log, spinner } from '@clack/prompts'
import { sleep } from '@tamery/shared/utils'

import { approvals } from '../bridge/approvals'
import { askInTerminal } from '../bridge/terminal-question'
import { paint } from '../paint'

const POLL_MS = 500

export const approve = async () => {
  if (approvals.waiting().length === 0) {
    const waiting = spinner()
    waiting.start(
      'Waiting for a browser. Click Connect in Tamery → Settings → Bridge.'
    )
    while (approvals.waiting().length === 0) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- polling the file the bridge writes requests to
      await sleep(POLL_MS)
    }
    waiting.stop('A browser asks to connect')
  }
  for (const request of approvals.waiting()) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one question at a time
    const allowed = await askInTerminal(request.question)
    if (allowed === null) {
      return
    }
    approvals.decide(request.id, allowed)
    log.message(paint.dim(allowed ? 'Allowed.' : 'Declined.'))
  }
}
