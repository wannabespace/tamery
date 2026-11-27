import type {
  InferRouterInputs,
  InferRouterOutputs,
  RouterClient,
} from '@orpc/server'

import * as usage from '~/modules/billing/routers/usage'
import * as chats from '~/modules/chat/routers/chats'
import * as chatsMessages from '~/modules/chat/routers/chats-messages'
import * as chatsMessagesParts from '~/modules/chat/routers/chats-messages-parts'
import { releases } from '~/modules/release-announcement/routers/releases'

import * as account from './account'
import * as ai from './ai'
import { banner } from './banner'
import * as connectionMachines from './connection-machines'
import * as connections from './connections'
import * as connectionsResources from './connections-resources'
import { contact } from './contact'
import { contactSales } from './contact-sales'
import { hasPasskey } from './has-passkey'
import * as internal from './internal'
import * as machines from './machines'
import * as queries from './queries'
import * as schemaNotes from './schema-notes'
import * as shares from './shares'
import { userCount } from './user-count'
import * as webhooks from './webhooks'
import * as workspaces from './workspaces'

export const router = {
  account,
  ai,
  banner,
  chats,
  chatsMessages,
  chatsMessagesParts,
  connectionMachines,
  connections,
  connectionsResources,
  contact,
  contactSales,
  hasPasskey,
  internal,
  machines,
  queries,
  releases,
  schemaNotes,
  shares,
  usage,
  userCount,
  webhooks,
  workspaces,
}

export type ORPCRouter = RouterClient<typeof router>
export type RouterOutputs = InferRouterOutputs<typeof router>
export type RouterInputs = InferRouterInputs<typeof router>
