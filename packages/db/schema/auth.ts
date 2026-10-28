import type { WorkspaceRole } from '@tamery/shared/workspace'
import { defineRelationsPart } from 'drizzle-orm'
import { createSelectSchema } from 'drizzle-orm/arktype'
import * as d from 'drizzle-orm/pg-core'

import { baseTable } from '../base-table'

export const users = d.snakeCase.table('users', {
  ...baseTable,
  desktopVersion: d.text(),
  email: d.text().notNull().unique(),
  emailVerified: d.boolean().default(false).notNull(),
  image: d.text(),
  isAnonymous: d.boolean().default(false),
  name: d.text().notNull(),
  normalizedEmail: d.text().unique(),
  stripeCustomerId: d.text(),
  twoFactorEnabled: d.boolean().default(false),
})

export const sessions = d.snakeCase.table(
  'sessions',
  {
    ...baseTable,
    activeWorkspaceId: d.text(),
    expiresAt: d.timestamp({ withTimezone: true }).notNull(),
    ipAddress: d.text(),
    token: d.text().notNull().unique(),
    userAgent: d.text(),
    userId: d
      .uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [d.index('sessions_userId_idx').on(table.userId)]
)

export const accounts = d.snakeCase.table(
  'accounts',
  {
    ...baseTable,
    accessToken: d.text(),
    accessTokenExpiresAt: d.timestamp({ withTimezone: true }),
    accountId: d.text().notNull(),
    idToken: d.text(),
    password: d.text(),
    providerId: d.text().notNull(),
    refreshToken: d.text(),
    refreshTokenExpiresAt: d.timestamp({ withTimezone: true }),
    scope: d.text(),
    userId: d
      .uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [d.index('accounts_userId_idx').on(table.userId)]
)

export const verifications = d.snakeCase.table(
  'verifications',
  {
    ...baseTable,
    expiresAt: d.timestamp({ withTimezone: true }).notNull(),
    identifier: d.text().notNull(),
    value: d.text().notNull(),
  },
  (table) => [d.index('verifications_identifier_idx').on(table.identifier)]
)

export const twoFactors = d.snakeCase.table(
  'two_factors',
  {
    ...baseTable,
    backupCodes: d.text().notNull(),
    failedVerificationCount: d.integer().default(0),
    lockedUntil: d.timestamp({ withTimezone: true }),
    secret: d.text().notNull(),
    userId: d
      .uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    verified: d.boolean().default(true),
  },
  (table) => [
    d.index('twoFactors_secret_idx').on(table.secret),
    d.index('twoFactors_userId_idx').on(table.userId),
  ]
)

export const workspaces = d.snakeCase.table(
  'workspaces',
  {
    ...baseTable,
    logo: d.text(),
    metadata: d.text(),
    name: d.text().notNull(),
    slug: d.text().notNull().unique(),
  },
  (table) => [d.uniqueIndex('workspaces_slug_uidx').on(table.slug)]
)

export const workspacesSelectSchema = createSelectSchema(workspaces)

export const members = d.snakeCase.table(
  'members',
  {
    ...baseTable,
    role: d.text().default('viewer').$type<WorkspaceRole>().notNull(),
    userId: d
      .uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: d
      .uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
  },
  (table) => [
    d.index('members_workspaceId_idx').on(table.workspaceId),
    d.index('members_userId_idx').on(table.userId),
  ]
)

export const invitations = d.snakeCase.table(
  'invitations',
  {
    ...baseTable,
    email: d.text().notNull(),
    expiresAt: d.timestamp({ withTimezone: true }).notNull(),
    inviterId: d
      .uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: d.text(),
    status: d.text().default('pending').notNull(),
    workspaceId: d
      .uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
  },
  (table) => [
    d.index('invitations_workspaceId_idx').on(table.workspaceId),
    d.index('invitations_email_idx').on(table.email),
  ]
)

export const authRelations = defineRelationsPart(
  {
    accounts,
    invitations,
    members,
    sessions,
    twoFactors,
    users,
    verifications,
    workspaces,
  },
  (r) => ({
    accounts: {
      users: r.one.users({
        from: r.accounts.userId,
        to: r.users.id,
      }),
    },
    invitations: {
      users: r.one.users({
        from: r.invitations.inviterId,
        to: r.users.id,
      }),
      workspaces: r.one.workspaces({
        from: r.invitations.workspaceId,
        to: r.workspaces.id,
      }),
    },
    members: {
      users: r.one.users({
        from: r.members.userId,
        to: r.users.id,
      }),
      workspaces: r.one.workspaces({
        from: r.members.workspaceId,
        to: r.workspaces.id,
      }),
    },
    sessions: {
      users: r.one.users({
        from: r.sessions.userId,
        to: r.users.id,
      }),
    },
    twoFactors: {
      users: r.one.users({
        from: r.twoFactors.userId,
        to: r.users.id,
      }),
    },
    users: {
      accounts: r.many.accounts({
        from: r.users.id,
        to: r.accounts.userId,
      }),
      invitations: r.many.invitations({
        from: r.users.id,
        to: r.invitations.inviterId,
      }),
      members: r.many.members({
        from: r.users.id,
        to: r.members.userId,
      }),
      sessions: r.many.sessions({
        from: r.users.id,
        to: r.sessions.userId,
      }),
      twoFactors: r.many.twoFactors({
        from: r.users.id,
        to: r.twoFactors.userId,
      }),
    },
    workspaces: {
      invitations: r.many.invitations({
        from: r.workspaces.id,
        to: r.invitations.workspaceId,
      }),
      members: r.many.members({
        from: r.workspaces.id,
        to: r.members.workspaceId,
      }),
    },
  })
)
