import process from 'node:process'

import { db } from '@tamery/db'
import { connections, workspaceEncryptionKeys } from '@tamery/db/schema'
import { decrypt, encrypt } from '@tamery/shared/crypto-node'
import { toError } from '@tamery/shared/utils'
import { and, eq, isNotNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'

// Rotates the per-workspace connection key (workspace_encryption_keys.secret), the inner
// layer of every connection string. Pure database work under one transaction per
// workspace: the ORM column types handle the outer ENCRYPTION_SECRET layer, so this
// decrypts the inner layer with the workspace's old key and re-encrypts it with a fresh
// one, flipping the key row and its connections together. No env change, no redeploy.
// Dry run by default; pass --execute. Positional workspace ids scope it (default: all).
const execute = process.argv.includes('--execute')
const onlyWorkspaceIds = new Set(
  process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
)

const rotateWorkspace = async (workspaceId: string, oldKey: string) => {
  const rows = await db
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

  const plaintexts: { id: string; text: string }[] = []
  for (const row of rows) {
    if (!row.connectionString) {
      continue
    }

    const encryptedText = row.connectionString
    try {
      plaintexts.push({
        id: row.id,
        text: decrypt({ encryptedText, secret: oldKey }),
      })
    } catch {
      return {
        error: `connection ${row.id} does not decrypt with the workspace's current key`,
      }
    }
  }

  if (!execute) {
    return { connections: plaintexts.length }
  }

  const newKey = nanoid()

  try {
    await db.transaction(async (tx) => {
      for (const { id, text } of plaintexts) {
        // oxlint-disable-next-line no-await-in-loop -- one statement per row, each a distinct ciphertext on one tx connection
        await tx
          .update(connections)
          .set({ connectionString: encrypt({ secret: newKey, text }) })
          .where(eq(connections.id, id))
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

  return { connections: plaintexts.length }
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
