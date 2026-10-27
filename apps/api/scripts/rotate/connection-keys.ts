import process from 'node:process'

import { db } from '@tamery/db'
import {
  connections,
  members,
  userEncryptionKeys,
  users,
} from '@tamery/db/schema'
import { decrypt, encrypt } from '@tamery/shared/crypto-node'
import { toError } from '@tamery/shared/utils'
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'

// Rotates the per-user connection key (user_encryption_keys.secret), the inner
// layer of every connection string. Pure database work under one transaction per
// user: the ORM column types handle the outer ENCRYPTION_SECRET layer, so this
// decrypts the inner layer with the user's old key and re-encrypts it with a fresh
// one, flipping the key row and its connections together. No env change, no redeploy.
// Dry run by default; pass --execute. Positional user ids scope it (default: all).
const execute = process.argv.includes('--execute')
const onlyUserIds = new Set(
  process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
)

const ownerMembers = await db
  .select({ userId: members.userId, workspaceId: members.workspaceId })
  .from(members)
  .where(eq(members.role, 'owner'))
  .orderBy(asc(members.createdAt))

const workspaceOwner = new Map<string, string>()
for (const { userId, workspaceId } of ownerMembers) {
  if (!workspaceOwner.has(workspaceId)) {
    workspaceOwner.set(workspaceId, userId)
  }
}

const ownedWorkspaces = new Map<string, string[]>()
for (const [workspaceId, userId] of workspaceOwner) {
  const owned = ownedWorkspaces.get(userId)
  if (owned) {
    owned.push(workspaceId)
  } else {
    ownedWorkspaces.set(userId, [workspaceId])
  }
}

const rotateUser = async (
  userId: string,
  oldKey: string,
  workspaceIds: string[]
) => {
  const rows = workspaceIds.length
    ? await db
        .select({
          connectionString: connections.connectionString,
          id: connections.id,
        })
        .from(connections)
        .where(
          and(
            inArray(connections.workspaceId, workspaceIds),
            isNotNull(connections.connectionString)
          )
        )
    : []

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
        error: `connection ${row.id} does not decrypt with the user's current key`,
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
        .update(userEncryptionKeys)
        .set({ secret: newKey })
        .where(eq(userEncryptionKeys.userId, userId))
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
    secret: userEncryptionKeys.secret,
    userId: userEncryptionKeys.userId,
  })
  .from(userEncryptionKeys)
  .innerJoin(users, eq(users.id, userEncryptionKeys.userId))

let rotated = 0
let reEncrypted = 0
const failures: string[] = []

for (const { secret, userId } of keyRows) {
  if (onlyUserIds.size && !onlyUserIds.has(userId)) {
    continue
  }

  // oxlint-disable-next-line no-await-in-loop -- sequential by design: each user's transaction settles before the next
  const result = await rotateUser(
    userId,
    secret,
    ownedWorkspaces.get(userId) ?? []
  )

  if ('error' in result) {
    failures.push(`${userId}: ${result.error}`)
    console.error(`✗ ${userId}: ${result.error}`)
    continue
  }

  rotated += 1
  reEncrypted += result.connections
}

console.log(
  execute
    ? `Rotated ${rotated} user key(s); re-encrypted ${reEncrypted} connection string(s).`
    : `Dry run: ${rotated} user key(s) ready to rotate, ${reEncrypted} connection string(s) verified decryptable. Re-run with --execute to apply.`
)

if (failures.length) {
  console.error(`${failures.length} user(s) skipped; resolve before rerunning.`)
  process.exit(1)
}

process.exit(0)
