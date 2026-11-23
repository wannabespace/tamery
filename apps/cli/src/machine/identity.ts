import fs from 'node:fs'

import { type } from 'arktype'
import { Result } from 'better-result'

import { configFiles } from '../config-files'

const machineId = type('string.uuid.v7')

/** The id the account lists this computer under, kept until the account changes so a restart never lists it twice. */
export const machineIdentity = {
  get: () => {
    const saved = Result.try(() =>
      fs.readFileSync(configFiles.machineId, 'utf-8').trim()
    )
    if (saved.isOk() && machineId.allows(saved.value)) {
      return saved.value
    }
    const id = Bun.randomUUIDv7()
    configFiles.write(configFiles.machineId, id)
    return id
  },
  reset: () => configFiles.remove(configFiles.machineId),
}
