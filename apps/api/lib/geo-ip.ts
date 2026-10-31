import { isIPv4, isIPv6 } from 'node:net'

import type { Response } from 'mmdb-lib'
import { Reader } from 'mmdb-lib'

// mmdb-lib types only MaxMind's layouts; ip-location-db stores these flat fields.
interface DbipCity {
  city?: string
  country_code?: string
}

// Reading the ~130 MB of databases into a Buffer would pin them in API memory; mmap leaves them to the page cache.
const openDatabase = (file: string) => {
  const bytes = Bun.mmap(
    Bun.resolveSync(`@ip-location-db/dbip-city-mmdb/${file}`, import.meta.dir)
  )
  return new Reader<Response>(
    Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  )
}

const ipv4 = openDatabase('dbip-city-ipv4.mmdb')
const ipv6 = openDatabase('dbip-city-ipv6.mmdb')
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

const lookup = (ip: string) => {
  if (isIPv4(ip)) {
    return ipv4.get(ip) as DbipCity | null
  }
  if (isIPv6(ip)) {
    return ipv6.get(ip) as DbipCity | null
  }
  return null
}

export const locateIp = (ip: string) => {
  const found = lookup(ip)
  const country = found?.country_code && regionNames.of(found.country_code)

  return [found?.city, country].filter(Boolean).join(', ') || null
}
