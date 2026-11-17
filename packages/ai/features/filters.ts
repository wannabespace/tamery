import { FILTER_OPERATORS, FILTERS_GROUPED } from '@tamery/shared/filters'
import type { TelemetryOptions } from 'ai'
import { generateText, Output } from 'ai'
import { type } from 'arktype'

import { models } from '../models/list'

export const filtersInstructions = (tableContext: string) =>
  [
    'You are a filters and ordering generator that converts natural language queries into database filters and ordering instructions.',
    'You should understand the sense of the prompt as much as possible.',
    'Each of your filters or ordering responses will replace the previous ones.',
    '',
    'Guidelines:',
    '- Create multiple filters when the query has multiple conditions',
    '- Use exact column names as provided in the context',
    '- Choose the most appropriate operator for each condition',
    '- Format values correctly based on column types (strings, numbers, dates, etc.)',
    '- For enum columns, ensure values match the available options',
    '- For exact days use gte and lte operators',
    "- If user asks 'empty' and the column is a string, use empty string as item in values array",
    '- If context already contains a filter, you can use it as reference to generate a new filter',
    '- User can paste only the value, you should try to understand to which column the value belongs',
    "- Filter only on what this table's own columns can express; never stretch a condition onto an unrelated column (such as matching words inside a JSON or text column it has nothing to do with)",
    "- List every part of the request you could not express as a filter or ordering in ignored, in a few of the user's words each; otherwise return an empty ignored array",
    '',
    'Ordering:',
    '- If the user requests sorting or ordering (e.g., "sort by date descending", "order by name ascending"), generate an orderBy array.',
    '- Use the exact column names from the context for ordering.',
    '- Each orderBy entry should have "column" (the column name) and "direction" ("ASC" or "DESC").',
    '- If no ordering is specified in the prompt, return an empty orderBy array.',
    '',
    `Current time: ${new Date().toISOString()}`,
    `Available operators: ${JSON.stringify(FILTERS_GROUPED, null, 2)}`,
    '',
    'Table context:',
    tableContext,
  ].join('\n')

const filtersOutputSchema = type({
  filters: type({
    column: 'string',
    operator: type.enumerated(...FILTER_OPERATORS),
    values: 'string[]',
  }).array(),
  ignored: 'string[]',
  orderBy: type({
    column: 'string',
    direction: "'ASC' | 'DESC'",
  }).array(),
})

export const generateFilters = async (data: {
  context: string
  prompt: string
  signal?: AbortSignal
  telemetry?: TelemetryOptions
}) => {
  const { output } = await generateText({
    abortSignal: data.signal,
    instructions: filtersInstructions(data.context),
    model: models.structured,
    output: Output.object({ schema: filtersOutputSchema }),
    prompt: data.prompt,
    telemetry: data.telemetry,
  })

  return {
    filters: output.filters,
    ignored: output.ignored,
    orderBy: Object.fromEntries(
      output.orderBy.map(({ column, direction }) => [column, direction])
    ),
  }
}
