import fs from 'node:fs'

import { type } from 'arktype'
import { Result } from 'better-result'
import { v7 } from 'uuid'

import { configFiles } from '../config-files'

const machineId = type('string.uuid.v7')

/** The id the account lists this computer under, kept until the account changes so a restart never lists it twice. */
export const machineIdentity = {
  get: () => {
    const saved = machineIdentity.saved()
    if (saved) {
      return saved
    }
    const id = v7()
    configFiles.write(configFiles.machineId, id)
    return id
  },
  reset: () => configFiles.remove(configFiles.machineId),
  saved: () => {
    const saved = Result.try(() =>
      fs.readFileSync(configFiles.machineId, 'utf-8').trim()
    )
    return saved.isOk() && machineId.allows(saved.value) ? saved.value : null
  },
}
