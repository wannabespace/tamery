import type { MachineRoute } from './pairing'

export const getNotPairedMessage = (name: string) =>
  `This connection runs on ${name}. Connect this browser to it in Settings → Machines.`

/** A connection runs on a machine this browser was never allowed on: the connection screen offers to connect it. */
export class MachineNotPairedError extends Error {
  readonly route: MachineRoute

  constructor(route: MachineRoute) {
    super(getNotPairedMessage(route.name))
    this.name = 'MachineNotPairedError'
    this.route = route
  }
}
