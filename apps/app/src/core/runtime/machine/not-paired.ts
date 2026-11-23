import type { MachineRoute } from './pairing'

/** A connection runs on a machine this browser was never allowed on: the connection screen offers to connect it. */
export class MachineNotPairedError extends Error {
  readonly route: MachineRoute

  constructor(route: MachineRoute) {
    super(
      `This connection runs on ${route.name}. Connect this browser to it to run queries.`
    )
    this.name = 'MachineNotPairedError'
    this.route = route
  }
}
