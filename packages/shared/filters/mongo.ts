import type { FilterValueBinding } from './kysely'
import type { ActiveFilter, FilterOperator } from './types'

const escapeRegex = (text: string) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)

const LIKE_WILDCARDS: Record<string, string> = { '%': '.*', _: '.' }

export const likeToRegex = (pattern: unknown) =>
  `^${String(pattern).replaceAll(
    /\\?[\s\S]/gu,
    (token) => LIKE_WILDCARDS[token] ?? escapeRegex(token.slice(-1))
  )}$`

const MONGO_CONDITIONS: Record<
  FilterOperator,
  (values: unknown[]) => Record<string, unknown>
> = {
  eq: ([value]) => ({ $eq: value }),
  gt: ([value]) => ({ $gt: value }),
  gte: ([value]) => ({ $gte: value }),
  ilike: ([value]) => ({ $options: 'i', $regex: likeToRegex(value) }),
  in: (values) => ({ $in: values }),
  isNotNull: () => ({ $ne: null }),
  isNull: () => ({ $eq: null }),
  like: ([value]) => ({ $regex: likeToRegex(value) }),
  lt: ([value]) => ({ $lt: value }),
  lte: ([value]) => ({ $lte: value }),
  ne: ([value]) => ({ $ne: value }),
  notIn: (values) => ({ $nin: values }),
  notLike: ([value]) => ({ $not: { $regex: likeToRegex(value) } }),
}

const PATTERN_OPERATORS = new Set<FilterOperator>(['ilike', 'like', 'notLike'])

const unbound: FilterValueBinding = (_column, value) => value

const condition = (
  { column, ref, values }: Pick<ActiveFilter, 'column' | 'ref' | 'values'>,
  bind: FilterValueBinding = unbound
) =>
  MONGO_CONDITIONS[ref.operator](
    PATTERN_OPERATORS.has(ref.operator)
      ? values
      : values.map((value) => bind(column, value))
  )

const viaField = (index: number) => `__via_${index}`

// `$lookup` combining `localField` with `pipeline` needs MongoDB 5.0+, and its `from` cannot leave the current database, so `via.schema` goes unused.
export const toMongoPipeline = (
  filters: ActiveFilter[],
  concatOperator: 'AND' | 'OR' = 'AND',
  bind: FilterValueBinding = unbound
) => {
  if (filters.length === 0) {
    return []
  }
  const lookups = filters.flatMap(({ column, via, ...filter }, index) =>
    via
      ? [
          {
            $lookup: {
              as: viaField(index),
              foreignField: via.key,
              from: via.table,
              localField: column,
              pipeline: [
                {
                  $match: {
                    [via.target]: condition({ ...filter, column: via.target }),
                  },
                },
                { $limit: 1 },
              ],
            },
          },
        ]
      : []
  )
  const match = {
    $match: {
      [concatOperator === 'AND' ? '$and' : '$or']: filters.map(
        (filter, index) =>
          filter.via
            ? { [viaField(index)]: { $ne: [] } }
            : { [filter.column]: condition(filter, bind) }
      ),
    },
  }
  return lookups.length === 0
    ? [match]
    : [...lookups, match, { $unset: lookups.map(({ $lookup }) => $lookup.as) }]
}
