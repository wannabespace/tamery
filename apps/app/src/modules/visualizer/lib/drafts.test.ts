import { expect, test } from 'bun:test'

import { diagramDrafts, diagramDraftsStore } from './drafts'
import { inApplyOrder } from './statements'

const orders = { schema: 's', table: 'orders' }
const users = { schema: 's', table: 'users' }
const original = {
  attributes: '',
  collation: null,
  comment: null,
  nullable: true,
  type: 'integer',
}
const id = { name: 'id', nullable: false, primaryKey: true, type: 'integer' }

const setup = (resourceId: string) => {
  const store = diagramDraftsStore(resourceId)
  return { drafts: () => store.get().drafts, edit: diagramDrafts(store) }
}

test('renames run after the statements that still name the original', () => {
  const { drafts, edit } = setup('order')
  edit.renameTable(orders, 'purchases')
  edit.renameColumn(orders, 'total', 'amount')
  edit.alterColumn(
    orders,
    'total',
    { nullable: false, type: 'integer' },
    original
  )

  expect(inApplyOrder(drafts()).map((draft) => draft.kind)).toEqual([
    'alterColumn',
    'renameColumn',
    'renameTable',
  ])
})

test('a foreign key drops before its column is altered', () => {
  const { drafts, edit } = setup('fk-order')
  edit.alterColumn(
    orders,
    'user_id',
    { nullable: false, type: 'integer' },
    original
  )
  edit.dropForeignKey(orders, 'orders_user_id_fkey')

  expect(inApplyOrder(drafts()).map((draft) => draft.kind)).toEqual([
    'dropForeignKey',
    'alterColumn',
  ])
})

test('an alter back to the original shape leaves no draft', () => {
  const { drafts, edit } = setup('noop')
  edit.alterColumn(
    orders,
    'total',
    { nullable: false, type: 'integer' },
    original
  )
  edit.alterColumn(
    orders,
    'total',
    { nullable: true, type: 'integer' },
    original
  )

  expect(drafts()).toEqual([])
})

test('a draft table carries its links through a rename and a drop', () => {
  const { drafts, edit } = setup('links')
  edit.createTable(users, [id])
  edit.addForeignKey({
    ...orders,
    columns: ['user_id'],
    foreignColumns: ['id'],
    foreignSchema: 's',
    foreignTable: 'users',
    kind: 'addForeignKey',
    name: 'orders_user_id_fkey',
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  edit.renameTable(users, 'people')

  expect(
    drafts().find((draft) => draft.kind === 'addForeignKey')
  ).toMatchObject({ foreignTable: 'people' })

  edit.dropTable({ schema: 's', table: 'people' }, false)

  expect(drafts()).toEqual([])
})

test('settling an apply keeps drafts queued while it ran', () => {
  const { drafts, edit } = setup('settle')
  edit.dropColumn(orders, 'total')
  const applied = drafts()
  edit.dropColumn(orders, 'note')
  edit.settle(applied)

  expect(drafts()).toMatchObject([{ column: 'note', kind: 'dropColumn' }])
})
