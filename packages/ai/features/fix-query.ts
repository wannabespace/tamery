import type { TelemetryOptions } from 'ai'
import { generateText } from 'ai'

import { models } from '../models/list'
import { EDITOR_CONTEXT, section, queryOutputRules } from './prompt'

const fixQueryInstructions = (data: {
  connectionType: string
  context: string
}) =>
  [
    'You are an expert at fixing database queries based on an error message.',
    'Fix the query so it is valid and correct.',
    'If the query is already valid and correct, return it unchanged.',
    'Use only names from the schema; never invent a name it does not list.',
    EDITOR_CONTEXT,
    ...queryOutputRules(data.connectionType),
    '',
    'Database schema:',
    data.context,
  ].join('\n')

export const fixQuery = async (data: {
  connectionType: string
  context: string
  editor: string
  error: string
  signal?: AbortSignal
  query: string
  telemetry?: TelemetryOptions
}) => {
  const { text } = await generateText({
    abortSignal: data.signal,
    instructions: fixQueryInstructions(data),
    model: models.query,
    prompt: [
      section('WHOLE EDITOR', data.editor),
      section('QUERY', data.query),
      section('ERROR', data.error),
    ].join('\n'),
    telemetry: data.telemetry,
  })
  return text
}
