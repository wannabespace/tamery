import process from 'node:process'

import { db } from '@tamery/db'
import { env } from '@tamery/db/env'
import {
  connections,
  deletedRecords,
  members,
  userEncryptionKeys,
  users,
} from '@tamery/db/schema'
import { resolveKeyring } from '@tamery/db/utils'
import { decrypt, encrypt } from '@tamery/shared/crypto-node'
import { toError } from '@tamery/shared/utils'
import {
  and,
  asc,
  eq,
  getTableName,
  inArray,
  isNotNull,
  sql,
} from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'

// Rotates the per-user connection key (user_encryption_keys.secret), the inner
// layer of every connection string. Pure database work under one transaction per
// user: the ORM column types handle the outer ENCRYPTION_SECRET layer, so this
// decrypts the inner layer with the user's old key and re-encrypts it with a fresh
// one, flipping the key row, its connections and their `deleted_records` copies
// together. No env change, no redeploy.
// Dry run by default; pass --execute. Positional user ids scope it (default: all).
const execute = process.argv.includes('--execute')
const onlyUserIds = new Set(
  process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
)

const copied = (column: PgColumn) =>
  sql<string>`(${deletedRecords.data} ->> ${column.name})`
const outerKeyring = resolveKeyring(env.ENCRYPTION_SECRET)

const ownerMembers = await db
  .select({ userId: members.userId, workspaceId: members.workspaceId })
  .from(members)
  .where(eq(members.role, 'owner'))
  .orderBy(asc(members.createdAt))

const deletedOwnerMembers = await db
  .select({
    userId: copied(members.userId),
    workspaceId: copied(members.workspaceId),
  })
  .from(deletedRecords)
  .where(
    and(
      eq(deletedRecords.tableName, getTableName(members)),
      eq(copied(members.role), 'owner')
    )
  )
  .orderBy(sql`${copied(members.createdAt)}::timestamptz`)

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

const rotateUser = async (
  userId: string,
  oldKey: string,
  workspaceIds: string[]
) => {
  const [rows, copies] = workspaceIds.length
    ? await Promise.all([
        db
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
          ),
        db
          .select({
            cipher: copied(connections.connectionString),
            id: deletedRecords.recordId,
          })
          .from(deletedRecords)
          .where(
            and(
              eq(deletedRecords.tableName, getTableName(connections)),
              inArray(copied(connections.workspaceId), workspaceIds),
              isNotNull(copied(connections.connectionString))
            )
          ),
      ])
    : [[], []]

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

  // Copies keep the raw column value, so the ORM's outer ENCRYPTION_SECRET layer is unwrapped here by hand.
  const copyPlaintexts: { id: string; text: string }[] = []
  for (const copy of copies) {
    try {
      copyPlaintexts.push({
        id: copy.id,
        text: decrypt({
          encryptedText: outerKeyring.decrypt(copy.cipher),
          secret: oldKey,
        }),
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
        await tx
          .update(connections)
          .set({ connectionString: encrypt({ secret: newKey, text }) })
          .where(eq(connections.id, id))
      }

      for (const { id, text } of copyPlaintexts) {
        const cipher = outerKeyring.encrypt(encrypt({ secret: newKey, text }))
        // oxlint-disable-next-line no-await-in-loop -- one statement per row, each a distinct ciphertext on one tx connection
        await tx
          .update(deletedRecords)
          .set({
            data: sql`jsonb_set(${deletedRecords.data}, ${`{${connections.connectionString.name}}`}::text[], to_jsonb(${cipher}::text))`,
          })
          .where(
            and(
              eq(deletedRecords.tableName, getTableName(connections)),
              eq(deletedRecords.recordId, id)
            )
          )
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
