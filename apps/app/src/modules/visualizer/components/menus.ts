import {
  AppWindowIcon,
  Copy01Icon,
  Delete02Icon,
  EraserIcon,
  Link01Icon,
  LinkSquare02Icon,
  PencilEdit01Icon,
  PlusSignIcon,
  Undo02Icon,
} from '@hugeicons/core-free-icons'
import { copy as copyToClipboard } from '@tamery/ui/lib/copy'

import type { AppMenuNode } from '~/components/app-menu'

import type {
  DiagramActions,
  DiagramContextValue,
  DiagramGates,
} from '../lib/context'
import type {
  DiagramColumn,
  DiagramRelation,
  DiagramTable,
} from '../lib/schema'

const referenceMenu = (
  table: DiagramTable,
  column: DiagramColumn,
  { actions, diagram }: Pick<DiagramContextValue, 'actions' | 'diagram'>
): AppMenuNode[] =>
  diagram.tables.flatMap((target) =>
    target.id === table.id ||
    target.kind !== 'table' ||
    target.state === 'dropped'
      ? []
      : target.columns
          .filter(
            (key) => (key.primaryKey || key.unique) && key.state !== 'dropped'
          )
          .map((key) => ({
            label: `${target.name}.${key.name}`,
            onSelect: () =>
              actions.linkColumns({
                column: column.id,
                foreignColumn: key.id,
                foreignTable: target.id,
                table: table.id,
              }),
          }))
  )

export const columnMenu = (
  table: DiagramTable,
  column: DiagramColumn,
  context: Pick<DiagramContextValue, 'actions' | 'can' | 'diagram'>
): AppMenuNode[] => {
  const { actions, can } = context
  const tableEditable = table.kind === 'table' && table.state !== 'dropped'
  const editable =
    tableEditable && column.state !== 'dropped' && !column.generated
  const references = referenceMenu(table, column, context)

  return [
    {
      disabled: !editable,
      icon: PencilEdit01Icon,
      label: 'Edit Column',
      onSelect: () => actions.editColumn(table, column),
    },
    {
      icon: Copy01Icon,
      label: 'Copy Name',
      onSelect: () => copyToClipboard(column.name, 'Column name copied'),
    },
    ...(can.alterColumns || column.state === 'added'
      ? [
          {
            disabled:
              !editable ||
              column.primaryKey ||
              !!can.neverNullable?.test(column.type),
            icon: EraserIcon,
            label: column.nullable ? 'Require a Value' : 'Allow NULL',
            onSelect: () => actions.toggleNullable(table, column),
          } satisfies AppMenuNode,
        ]
      : []),
    ...(can.foreignKeys
      ? [
          {
            disabled:
              !tableEditable ||
              column.state === 'dropped' ||
              references.length === 0,
            icon: Link01Icon,
            items: references,
            label: 'Reference',
            type: 'sub',
          } satisfies AppMenuNode,
        ]
      : []),
    { type: 'separator' },
    column.state === 'dropped'
      ? {
          disabled: !tableEditable,
          icon: Undo02Icon,
          label: 'Restore Column',
          onSelect: () => actions.dropColumn(table, column),
        }
      : {
          disabled: !tableEditable,
          icon: Delete02Icon,
          label: 'Drop Column',
          onSelect: () => actions.dropColumn(table, column),
          variant: 'destructive',
        },
  ]
}

export const tableMenu = (
  table: DiagramTable,
  can: DiagramGates,
  actions: DiagramActions
): AppMenuNode[] => {
  const editable = table.kind === 'table'
  const added = table.state === 'added'

  return [
    {
      disabled: added,
      icon: AppWindowIcon,
      label: 'Open in New Window',
      onSelect: () => actions.openTable(table, true),
    },
    { type: 'separator' },
    {
      disabled: added,
      icon: LinkSquare02Icon,
      label: 'Open Table',
      onSelect: () => actions.openTable(table),
    },
    {
      icon: Copy01Icon,
      label: 'Copy Name',
      onSelect: () => copyToClipboard(table.name, 'Table name copied'),
    },
    { type: 'separator' },
    {
      disabled: !editable || table.state === 'dropped',
      icon: PencilEdit01Icon,
      label: 'Rename Table',
      onSelect: () => actions.renameTable(table),
    },
    {
      disabled: !editable || table.state === 'dropped',
      icon: PlusSignIcon,
      label: 'Add Column',
      onSelect: () => actions.addColumn(table),
    },
    { type: 'separator' },
    ...(table.state === 'dropped'
      ? [
          {
            icon: Undo02Icon,
            label: 'Restore Table',
            onSelect: () => actions.restoreTable(table),
          } satisfies AppMenuNode,
        ]
      : [
          {
            disabled: !editable,
            icon: Delete02Icon,
            label: 'Drop Table',
            onSelect: () => actions.dropTable(table, false),
            variant: 'destructive',
          } satisfies AppMenuNode,
          ...(can.cascade && editable && !added
            ? [
                {
                  icon: Delete02Icon,
                  label: 'Drop Table with Dependents',
                  onSelect: () => actions.dropTable(table, true),
                  variant: 'destructive',
                } satisfies AppMenuNode,
              ]
            : []),
        ]),
  ]
}

export const relationMenu = (
  relation: DiagramRelation,
  actions: DiagramActions
): AppMenuNode[] => [
  relation.state === 'dropped'
    ? {
        icon: Undo02Icon,
        label: 'Restore Foreign Key',
        onSelect: () => actions.dropRelation(relation),
      }
    : {
        icon: Delete02Icon,
        label: 'Drop Foreign Key',
        onSelect: () => actions.dropRelation(relation),
        variant: 'destructive',
      },
]
