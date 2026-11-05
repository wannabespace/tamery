import '@tamery/shared/arktype-config'
import process from 'node:process'

import { db } from '@tamery/db'
import {
  connections,
  copies,
  deletedRecords,
  workspaceEncryptionKeys,
} from '@tamery/db/schema'
import { decrypt, encrypt } from '@tamery/shared/crypto-node'
import { toError } from '@tamery/shared/utils'
import { and, eq, isNotNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'

const execute = process.argv.includes('--execute')
const onlyWorkspaceIds = new Set(
  process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
)

const rotateWorkspace = async (workspaceId: string, oldKey: string) => {
  const selectRows = (executor: Pick<typeof db, 'select'>) =>
    executor
      .select({
        connectionString: connections.connectionString,
        id: connections.id,
      })
      .from(connections)
      .where(
        and(
          eq(connections.workspaceId, workspaceId),
          isNotNull(connections.connectionString)
        )
      )

  // Live rows load before the copies, so a connection deleted any time after is still a
  // live row the locked re-read below misses, aborting the workspace, instead of its copy
  // being left under the key the transaction replaces.
  const rows = await selectRows(db)
  const copyRows = await db
    .select({
      connectionString: copies
        .column(connections.connectionString)
        .mapWith(connections.connectionString),
      id: deletedRecords.recordId,
    })
    .from(deletedRecords)
    .where(
      and(
        copies.of(connections),
        eq(copies.column(connections.workspaceId), workspaceId),
        isNotNull(copies.column(connections.connectionString))
      )
    )

  const plaintexts: { encryptedText: string; id: string; text: string }[] = []
  for (const row of rows) {
    if (!row.connectionString) {
      continue
    }

    const encryptedText = row.connectionString
    try {
      plaintexts.push({
        encryptedText,
        id: row.id,
        text: decrypt({ encryptedText, secret: oldKey }),
      })
    } catch {
      return {
        error: `connection ${row.id} does not decrypt with the workspace's current key`,
      }
    }
  }

  const copyPlaintexts: { id: string; text: string }[] = []
  for (const copy of copyRows) {
    try {
      copyPlaintexts.push({
        id: copy.id,
        text: decrypt({ encryptedText: copy.connectionString, secret: oldKey }),
      })
    } catch {
      return {
        error: `deleted connection ${copy.id} does not decrypt with the workspace's current key`,
      }
    }
  }

  const count = { connections: plaintexts.length + copyPlaintexts.length }

  if (!execute) {
    return count
  }

  const newKey = nanoid()

  try {
    await db.transaction(async (tx) => {
      // Rows, then the key, then the rows again: writers take the row before the key (`workspaceEncryptionKey.getLocked`), so the other order deadlocks, and only the read after the key lock sees a string a create or move wrote under the old key while this waited. That read is compared with what was decrypted, so an edit, move or delete since aborts the run.
      await selectRows(tx).for('update')
      await tx
        .select({ workspaceId: workspaceEncryptionKeys.workspaceId })
        .from(workspaceEncryptionKeys)
        .where(eq(workspaceEncryptionKeys.workspaceId, workspaceId))
        .for('update')
      const locked = await selectRows(tx).for('update')
      const unchanged =
        locked.length === plaintexts.length &&
        plaintexts.every(({ encryptedText, id }) =>
          locked.some(
            (row) => row.id === id && row.connectionString === encryptedText
          )
        )

      if (!unchanged) {
        throw new Error(
          "the workspace's connections were edited, moved or deleted during the run; rerun to rotate them"
        )
      }

      for (const { id, text } of plaintexts) {
        // oxlint-disable-next-line no-await-in-loop -- one statement per row, each a distinct ciphertext on one tx connection
        await tx
          .update(connections)
          .set({ connectionString: encrypt({ secret: newKey, text }) })
          .where(eq(connections.id, id))
      }

      for (const { id, text } of copyPlaintexts) {
        // oxlint-disable-next-line no-await-in-loop -- one statement per row, each a distinct ciphertext on one tx connection
        await tx
          .update(deletedRecords)
          .set({
            data: copies.replace(
              connections.connectionString,
              connections.connectionString.mapToDriverValue(
                encrypt({ secret: newKey, text })
              )
            ),
          })
          .where(and(copies.of(connections), eq(deletedRecords.recordId, id)))
      }

      await tx
        .update(workspaceEncryptionKeys)
        .set({ secret: newKey })
        .where(eq(workspaceEncryptionKeys.workspaceId, workspaceId))
    })
  } catch (error) {
    return {
      error: `rotation aborted, no changes applied: ${toError(error).message}`,
    }
  }

  return count
}

const keyRows = await db
  .select({
    secret: workspaceEncryptionKeys.secret,
    workspaceId: workspaceEncryptionKeys.workspaceId,
  })
  .from(workspaceEncryptionKeys)

let rotated = 0
let reEncrypted = 0
const failures: string[] = []

for (const { secret, workspaceId } of keyRows) {
  if (onlyWorkspaceIds.size && !onlyWorkspaceIds.has(workspaceId)) {
    continue
  }

  // oxlint-disable-next-line no-await-in-loop -- sequential by design: each workspace's transaction settles before the next
  const result = await rotateWorkspace(workspaceId, secret)

  if ('error' in result) {
    failures.push(`${workspaceId}: ${result.error}`)
    console.error(`✗ ${workspaceId}: ${result.error}`)
    continue
  }

  rotated += 1
  reEncrypted += result.connections
}

console.log(
  execute
    ? `Rotated ${rotated} workspace key(s); re-encrypted ${reEncrypted} connection string(s).`
    : `Dry run: ${rotated} workspace key(s) ready to rotate, ${reEncrypted} connection string(s) verified decryptable. Re-run with --execute to apply.`
)

if (failures.length) {
  console.error(
    `${failures.length} workspace(s) skipped; resolve before rerunning.`
  )
  process.exit(1)
}

process.exit(0)
