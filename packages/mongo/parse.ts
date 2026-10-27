import type { AnyNode, Expression, MemberExpression } from 'acorn'
import { parse } from 'acorn'
import { Result } from 'better-result'

import type {
  CollectionMethod,
  CursorMethod,
  DatabaseMethod,
  MethodEffect,
} from './methods'
import { COLLECTION_METHODS, CURSOR_METHODS, DATABASE_METHODS } from './methods'

interface Link {
  name: string
  args: Expression[] | null
}

interface CursorCall {
  method: CursorMethod
  args: Expression[]
}

/** Arguments stay syntax: the executor evaluates them as BSON, the editor only reads their keys. */
export type MongoCall = {
  database: string | null
  cursor: CursorCall[]
  start: number
  end: number
} & (
  | { collection: null; method: DatabaseMethod; args: Expression[] }
  | { collection: string; method: CollectionMethod; args: Expression[] }
)

const SHAPE_HINT =
  'Write db.<collection>.<method>(…) or db.runCommand({ … }), one call per statement.'

const fail = (message: string): never => {
  throw new Error(`${message} ${SHAPE_HINT}`)
}

const has = <T extends object>(
  record: T,
  key: string
): key is Extract<keyof T, string> => Object.hasOwn(record, key)

const stringOf = (node: AnyNode | undefined) => {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value
  }
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null
  }
  return null
}

const propertyName = ({ computed, property }: MemberExpression) => {
  if (computed) {
    return stringOf(property)
  }
  return property.type === 'Identifier' ? property.name : null
}

const linksOf = (node: Expression): Link[] => {
  switch (node.type) {
    case 'Identifier': {
      return [{ args: null, name: node.name }]
    }
    case 'MemberExpression': {
      if (node.object.type === 'Super') {
        return fail('Unsupported expression.')
      }
      return [
        ...linksOf(node.object),
        {
          args: null,
          name: propertyName(node) ?? fail('Name properties with plain text.'),
        },
      ]
    }
    case 'CallExpression': {
      if (node.callee.type === 'Super') {
        return fail('Unsupported expression.')
      }
      const links = linksOf(node.callee)
      const callee = links.at(-1)
      if (!callee || callee.args) {
        return fail('Unsupported call.')
      }
      callee.args = node.arguments.map((arg) =>
        arg.type === 'SpreadElement'
          ? fail('Spread arguments are not supported.')
          : arg
      )
      return links
    }
    case 'AwaitExpression': {
      return linksOf(node.argument)
    }
    case 'ChainExpression': {
      return linksOf(node.expression)
    }
    default: {
      return fail(`Unsupported expression.`)
    }
  }
}

const stringArgument = ({ args, name }: Link) =>
  stringOf(args?.[0]) ?? fail(`${name}() takes the name as text.`)

const CURSOR_SOURCES = new Set(['aggregate', 'find'])

const cursorCalls = (method: string, links: Link[]) =>
  links.map(({ args, name }): CursorCall => {
    if (!(args && has(CURSOR_METHODS, name) && CURSOR_SOURCES.has(method))) {
      return fail(`.${name} cannot follow ${method}().`)
    }
    return { args, method: name }
  })

const collectionOf = (links: Link[]) => {
  const [first] = links
  if (first?.name === 'getCollection' && first.args) {
    return { collection: stringArgument(first), rest: links.slice(1) }
  }
  const called = links.findIndex(({ args }) => args)
  if (called < 1) {
    return fail('Call a method on a collection.')
  }
  return {
    collection: links
      .slice(0, called)
      .map(({ name }) => name)
      .join('.'),
    rest: links.slice(called),
  }
}

const callOf = (expression: Expression): MongoCall => {
  const [root, ...links] = linksOf(expression)
  if (root?.name !== 'db' || root.args) {
    return fail('Only db calls run here.')
  }
  const { start, end } = expression
  let rest = links
  let database: string | null = null
  if (rest[0]?.name === 'getSiblingDB' && rest[0].args) {
    database = stringArgument(rest[0])
    rest = rest.slice(1)
  }

  const [first, ...afterFirst] = rest
  if (first?.args && has(DATABASE_METHODS, first.name)) {
    return {
      args: first.args,
      collection: null,
      cursor: cursorCalls(first.name, afterFirst),
      database,
      end,
      method: first.name,
      start,
    }
  }

  const { collection, rest: calls } = collectionOf(rest)
  const [call, ...cursor] = calls
  if (!(call?.args && has(COLLECTION_METHODS, call.name))) {
    return fail(
      `${call ? `.${call.name}()` : 'This'} is not a collection method Tamery runs.`
    )
  }
  return {
    args: call.args,
    collection,
    cursor: cursorCalls(call.name, cursor),
    database,
    end,
    method: call.name,
    start,
  }
}

export const parseScript = (text: string) => {
  const parsed = Result.try(() =>
    parse(text, {
      allowAwaitOutsideFunction: true,
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
  )
  if (parsed.isErr()) {
    const { cause } = parsed.error
    return fail(
      `This is not MongoDB shell syntax (${cause instanceof Error ? cause.message : String(cause)}).`
    )
  }
  return parsed.value.body.flatMap((statement) => {
    if (statement.type === 'EmptyStatement') {
      return []
    }
    if (statement.type !== 'ExpressionStatement') {
      return fail('Only db calls run here.')
    }
    return [callOf(statement.expression)]
  })
}

/**
 * Insert document assembles the user's text into one `insertOne(<text>)` and runs it as a script, so a crafted document
 * can close the call and chain more statements (`dropDatabase()`, another collection's write). This rejects anything that
 * parses into more than that single `insertOne` on the collection — extra calls, a cursor chain or `getSiblingDB`.
 */
export const parseInsertOne = (text: string, collection: string): MongoCall => {
  const [call, ...rest] = parseScript(text)
  if (
    !call ||
    rest.length > 0 ||
    call.collection !== collection ||
    call.method !== 'insertOne' ||
    call.database !== null ||
    call.cursor.length > 0
  ) {
    throw new Error(
      'Insert document runs one insertOne on this collection. Remove anything else.'
    )
  }
  return call
}

const WRITING_STAGES = new Set(['$merge', '$out'])

const READ_COMMANDS = new Set([
  'buildinfo',
  'collstats',
  'connectionstatus',
  'count',
  'dbstats',
  'distinct',
  'hello',
  'hostinfo',
  'ismaster',
  'listcollections',
  'listdatabases',
  'listindexes',
  'ping',
  'serverstatus',
])

const keyName = (key: AnyNode) =>
  key.type === 'Identifier' ? key.name : stringOf(key)

const namesWritingStage = (node: AnyNode): boolean => {
  if (node.type === 'ObjectExpression') {
    return node.properties.some(
      (property) =>
        property.type === 'Property' &&
        ((!property.computed &&
          WRITING_STAGES.has(keyName(property.key) ?? '')) ||
          namesWritingStage(property.value))
    )
  }
  if (node.type === 'ArrayExpression') {
    return node.elements.some(
      (element) => element !== null && namesWritingStage(element)
    )
  }
  return false
}

const commandName = ([command]: Expression[]) => {
  const [first] = command?.type === 'ObjectExpression' ? command.properties : []
  return first?.type === 'Property' ? keyName(first.key)?.toLowerCase() : null
}

/** An aggregation that ends in `$out` or `$merge` writes its result into a collection; a command is read-only only when listed. */
export const getEffect = (call: MongoCall): MethodEffect => {
  if (call.method === 'aggregate' && call.args.some(namesWritingStage)) {
    return 'write'
  }
  if (call.collection !== null) {
    return COLLECTION_METHODS[call.method].effect
  }
  const { effect } = DATABASE_METHODS[call.method]
  if (effect !== 'command') {
    return effect
  }
  return READ_COMMANDS.has(commandName(call.args) ?? '') ? 'read' : 'command'
}
