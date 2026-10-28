import { expect, test } from 'bun:test'

import { getResultChart } from './result-chart'

test('a time and a number make a line in time order', () => {
  const chart = getResultChart(
    ['day', 'orders'],
    [
      { day: '2026-03-02', orders: '12' },
      { day: '2026-03-01', orders: 40n },
    ]
  )
  expect(chart).toEqual({
    kind: 'line',
    points: [
      { x: '2026-03-01', y: 40 },
      { x: '2026-03-02', y: 12 },
    ],
    x: 'day',
    y: 'orders',
  })
})

test('a category and a number make bars, keeping the result order', () => {
  expect(
    getResultChart(
      ['status', 'count'],
      [
        { count: 61, status: 'PAID' },
        { count: 47, status: 'PENDING' },
      ]
    )
  ).toMatchObject({
    kind: 'bar',
    points: [
      { x: 'PAID', y: 61 },
      { x: 'PENDING', y: 47 },
    ],
  })
})

test('numbers alone, one row or no number make no chart', () => {
  expect(
    getResultChart(
      ['month', 'n'],
      [
        { month: 1, n: 3 },
        { month: 2, n: 4 },
      ]
    )
  ).toBeNull()
  expect(getResultChart(['status', 'n'], [{ n: 3, status: 'PAID' }])).toBeNull()
  expect(
    getResultChart(
      ['name', 'email'],
      [
        { email: 'a', name: 'b' },
        { email: 'c', name: 'd' },
      ]
    )
  ).toBeNull()
})
