import { db } from '@tamery/db'
import { machines } from '@tamery/db/schema'
import type { MachineId } from '@tamery/shared/machine'
import { and, eq } from 'drizzle-orm'

/** `connection_machines.machine_id` for Tamery Cloud, open to everyone; desktop apps send it as is. */
export const TAMERY_CLOUD = null

export const canRunOn = async (userId: string, machineId: MachineId) => {
  const [machine] = await db
    .select({ id: machines.id })
    .from(machines)
    .where(and(eq(machines.id, machineId), eq(machines.userId, userId)))
  return !!machine
}
