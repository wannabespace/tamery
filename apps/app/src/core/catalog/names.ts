import { useConnectionContext } from '~/core/connection/route'

import { getCapabilities } from './capabilities'

/** What the open resource's engine calls a table, a column and a row. */
export const useObjectNames = () =>
  getCapabilities(useConnectionContext().dialect).names
