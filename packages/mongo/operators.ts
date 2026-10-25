import {
  ACCUMULATORS,
  CONVERSION_OPERATORS,
  EXPRESSION_OPERATORS as EXPRESSIONS,
  QUERY_OPERATORS as QUERIES,
  STAGE_OPERATORS,
} from '@mongodb-js/mongodb-constants'

const values = (operators: readonly { value: string }[]) =>
  operators.map(({ value }) => value)

export const QUERY_OPERATORS = values(QUERIES)

export const PIPELINE_STAGES = values(STAGE_OPERATORS)

export const EXPRESSION_OPERATORS = [
  ...new Set(
    values([...EXPRESSIONS, ...ACCUMULATORS, ...CONVERSION_OPERATORS])
  ),
]

// mongodb-constants ships no update-operator set, so this stays the source for them.
export const UPDATE_OPERATORS = [
  '$addToSet',
  '$currentDate',
  '$inc',
  '$max',
  '$min',
  '$mul',
  '$pop',
  '$pull',
  '$pullAll',
  '$push',
  '$rename',
  '$set',
  '$setOnInsert',
  '$unset',
]

export const BSON_CONSTRUCTORS = {
  ISODate: "ISODate('$0')",
  NumberDecimal: "NumberDecimal('$0')",
  NumberInt: 'NumberInt($0)',
  NumberLong: "NumberLong('$0')",
  ObjectId: "ObjectId('$0')",
  UUID: "UUID('$0')",
}
