import { expect, test } from 'bun:test'

import { locateIp } from './geo-ip'

test.each(['8.8.8.8', '2001:4860:4860::8888'])(
  'a public %s resolves to its city and country',
  (ip) => {
    expect(locateIp(ip)).toMatch(/^[^,]+, [^,]+$/u)
  }
)
