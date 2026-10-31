import process from 'node:process'

import { db } from '@tamery/db'
import {
  connections,
  copies,
  deletedRecords,
  members,
  userEncryptionKeys,
  users,
} from '@tamery/db/schema'
import { decrypt, encrypt } from '@tamery/shared/crypto-node'
import { toError } from '@tamery/shared/utils'
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'

// Rotates the per-user connection key (user_encryption_keys.secret), the inner
// layer of every connection string. Pure database work under one transaction per
// user: the ORM column type handles the outer ENCRYPTION_SECRET layer, for the
// `deleted_records` copies too, so this decrypts the inner layer with the user's
// old key and re-encrypts it with a fresh one, flipping the key row, its
// connections and their copies together. No env change, no redeploy.
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

const deletedOwnerMembers = await db
  .select({
    userId: copies.column(members.userId),
    workspaceId: copies.column(members.workspaceId),
  })
  .from(deletedRecords)
  .where(and(copies.of(members), eq(copies.column(members.role), 'owner')))
  .orderBy(sql`${copies.column(members.createdAt)}::timestamptz`)

// Live owners first: a deleted owner copy only decides a workspace that no longer has one.
const workspaceOwner = new Map<string, string>()
for (const { userId, workspaceId } of [
  ...ownerMembers,
  ...deletedOwnerMembers,
]) {
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

// Live rows load before the copies, so a connection deleted any time after is still a
// live row whose update in rotateUser misses and aborts that user, instead of its copy
// being left under the key the transaction replaces.
const liveConnections = Object.groupBy(
  await db
    .select({
      connectionString: connections.connectionString,
      id: connections.id,
      workspaceId: connections.workspaceId,
    })
    .from(connections)
    .where(isNotNull(connections.connectionString)),
  (connection) => connection.workspaceId
)
const deletedConnections = Object.groupBy(
  await db
    .select({
      connectionString: copies
        .column(connections.connectionString)
        .mapWith(connections.connectionString),
      id: deletedRecords.recordId,
      workspaceId: copies.column(connections.workspaceId),
    })
    .from(deletedRecords)
    .where(
      and(
        copies.of(connections),
        isNotNull(copies.column(connections.connectionString))
      )
    ),
  (connection) => connection.workspaceId
)

const rotateUser = async (
  userId: string,
  oldKey: string,
  workspaceIds: string[]
) => {
  const plaintexts: { id: string; text: string }[] = []
  for (const row of workspaceIds.flatMap((id) => liveConnections[id] ?? [])) {
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

  const copyPlaintexts: { id: string; text: string }[] = []
  for (const copy of workspaceIds.flatMap(
    (id) => deletedConnections[id] ?? []
  )) {
    try {
      copyPlaintexts.push({
        id: copy.id,
        text: decrypt({ encryptedText: copy.connectionString, secret: oldKey }),
      })
    } catch {
      return {
        error: `deleted connection ${copy.id} does not decrypt with the user's current key`,
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
      for (const { id, text } of plaintexts) {
        // oxlint-disable-next-line no-await-in-loop -- one statement per row, each a distinct ciphertext on one tx connection
        const { rowCount } = await tx
          .update(connections)
          .set({ connectionString: encrypt({ secret: newKey, text }) })
          .where(eq(connections.id, id))

        if (!rowCount) {
          throw new Error(
            `connection ${id} was deleted during the run; rerun to rotate its copy`
          )
        }
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
        .update(userEncryptionKeys)
        .set({ secret: newKey })
        .where(eq(userEncryptionKeys.userId, userId))
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
