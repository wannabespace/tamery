import { db } from '@tamery/db'
import { machines } from '@tamery/db/schema'
import { and, eq } from 'drizzle-orm'

/** `null` is Tamery Cloud, open to everyone. */
export const canRunOn = async (userId: string, machineId: string | null) => {
  if (machineId === null) {
    return true
  }
  const [machine] = await db
    .select({ id: machines.id })
    .from(machines)
    .where(and(eq(machines.id, machineId), eq(machines.userId, userId)))
  return !!machine
}
