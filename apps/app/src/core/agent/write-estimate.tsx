import { plural } from '~/utils/plural'

export const WriteEstimate = ({ rows }: { rows: number }) => (
  <p className="text-muted-foreground text-xs">
    The database estimates it changes about {plural(rows, 'row')}.
  </p>
)
