import { describe, expect, it } from 'bun:test'

import { AI_SQL_LIMITS } from '@tamery/ai/limits'
import type { SqlCatalog } from '@tamery/sql'

import { catalogSummary } from './catalog-summary'

const catalog = (tables: number): SqlCatalog => ({
  defaultSchema: 'public',
  enums: [],
  nameCase: null,
  schemas: [
    {
      name: 'public',
      tables: Array.from({ length: tables }, (_, index) => ({
        columns:
          index === tables - 1
            ? [{ name: 'id', nullable: false, type: 'int' }]
            : null,
        kind: 'table',
        name: `table_${index}`,
      })),
    },
  ],
})

describe('catalogSummary', () => {
  it('puts tables with loaded columns first', () => {
    expect(catalogSummary(catalog(3)).split('\n')).toEqual([
      'public.table_2(id int)',
      'public.table_0',
      'public.table_1',
    ])
  })

  it('appends comments on one line', () => {
    expect(
      catalogSummary({
        defaultSchema: 'public',
        enums: [],
        nameCase: null,
        schemas: [
          {
            name: 'public',
            tables: [
              {
                columns: [
                  {
                    comment: 'in\ncents',
                    name: 'amount',
                    nullable: false,
                    type: 'int',
                  },
                ],
                comment: 'Paid orders',
                kind: 'table',
                name: 'orders',
              },
            ],
          },
        ],
      })
    ).toBe('public.orders(amount int /* in cents */) /* Paid orders */')
  })

  it('stays within what the AI routes accept', () => {
    const summary = catalogSummary(catalog(20_000))
    expect(summary.length).toBeLessThanOrEqual(AI_SQL_LIMITS.context)
    expect(summary.startsWith('public.table_19999(id int)')).toBe(true)
  })
})
