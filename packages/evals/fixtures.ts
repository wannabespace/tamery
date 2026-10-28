import { query as mongodb } from '@tamery/connection/queries/dialects/mongodb'
import { query as mysql } from '@tamery/connection/queries/dialects/mysql'
import { query as postgres } from '@tamery/connection/queries/dialects/pg'
import type { ConnectionType } from '@tamery/shared/enums/connection-type'

export type Engine =
  | ConnectionType.MongoDB
  | ConnectionType.MySQL
  | ConnectionType.Postgres

export const executors = { mongodb, mysql, postgres }

export const connectionStrings: Record<Engine, string> = {
  mongodb: process.env.EVAL_MONGODB_URL ?? 'mongodb://127.0.0.1:27018/shop',
  mysql: process.env.EVAL_MYSQL_URL ?? 'mysql://root:root@127.0.0.1:3307/shop',
  postgres:
    process.env.EVAL_POSTGRES_URL ??
    'postgres://postgres:postgres@127.0.0.1:5434/shop',
}

const COUNTRIES = ['US', 'DE', 'UA', 'FR', 'GB', 'PL']
const CATEGORIES = ['Books', 'Games', 'Garden', 'Kitchen']
const STATUSES = ['PAID', 'SHIPPED', 'REFUNDED', 'PENDING']
const FIRST_NAMES = [
  'Ada',
  'Bohdan',
  'Chloe',
  'Dmytro',
  'Emma',
  'Felix',
  'Greta',
  'Hugo',
]
const LAST_NAMES = ['Kovalenko', 'Schmidt', 'Martin', 'Smith', 'Nowak']

/** A fixed pseudo-random sequence, so every run and every engine holds the same rows. */
const createRandom = (seed: number) => {
  let state = seed
  return (max: number) => {
    state += 1
    const noise = Math.sin(state) * 10_000
    return Math.floor((noise - Math.floor(noise)) * max)
  }
}

const random = createRandom(42)

export const shop = (() => {
  const customers = Array.from({ length: 40 }, (_, index) => {
    const first = FIRST_NAMES[index % FIRST_NAMES.length] ?? ''
    const last = LAST_NAMES[index % LAST_NAMES.length] ?? ''
    return {
      country: COUNTRIES[random(COUNTRIES.length)] ?? 'US',
      created_at: new Date(Date.UTC(2025, random(12), 1 + random(28))),
      email: `${first}.${last}${index + 1}@example.com`.toLowerCase(),
      id: index + 1,
      name: `${first} ${last}`,
    }
  })
  const products = Array.from({ length: 20 }, (_, index) => ({
    category: CATEGORIES[index % CATEGORIES.length] ?? 'Books',
    id: index + 1,
    name: `Product ${String.fromCodePoint(65 + index)}`,
    price_cents: 500 + random(9500),
  }))
  const items: {
    order_id: number
    product_id: number
    quantity: number
    unit_price_cents: number
  }[] = []
  const orders = Array.from({ length: 200 }, (_, index) => {
    const id = index + 1
    const lines = 1 + random(3)
    let total = 0
    for (let line = 0; line < lines; line += 1) {
      const product = products[(id * 7 + line * 3) % products.length]
      const quantity = 1 + random(4)
      if (product) {
        items.push({
          order_id: id,
          product_id: product.id,
          quantity,
          unit_price_cents: product.price_cents,
        })
        total += quantity * product.price_cents
      }
    }
    return {
      created_at: new Date(
        Date.UTC(2026, random(6), 1 + random(28), random(24))
      ),
      customer_id: 1 + random(customers.length),
      id,
      status: STATUSES[random(STATUSES.length)] ?? 'PAID',
      total_cents: total,
    }
  })
  return { customers, items, orders, products }
})()

const sqlValue = (value: unknown) => {
  if (value instanceof Date) {
    return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`
  }
  return typeof value === 'number' ? String(value) : `'${String(value)}'`
}

const insert = (table: string, rows: Record<string, unknown>[]) => {
  const columns = Object.keys(rows[0] ?? {})
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${rows
    .map(
      (row) => `(${columns.map((column) => sqlValue(row[column])).join(', ')})`
    )
    .join(', ')}`
}

const sqlStatements = (timestamp: string) => [
  'DROP TABLE IF EXISTS order_items',
  'DROP TABLE IF EXISTS orders',
  'DROP TABLE IF EXISTS products',
  'DROP TABLE IF EXISTS customers',
  `CREATE TABLE customers (id INT PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(200) NOT NULL UNIQUE, country CHAR(2) NOT NULL, created_at ${timestamp} NOT NULL)`,
  'CREATE TABLE products (id INT PRIMARY KEY, name VARCHAR(100) NOT NULL, category VARCHAR(50) NOT NULL, price_cents INT NOT NULL)',
  `CREATE TABLE orders (id INT PRIMARY KEY, customer_id INT NOT NULL REFERENCES customers (id), status VARCHAR(20) NOT NULL, created_at ${timestamp} NOT NULL, total_cents INT NOT NULL)`,
  'CREATE TABLE order_items (order_id INT NOT NULL REFERENCES orders (id), product_id INT NOT NULL REFERENCES products (id), quantity INT NOT NULL, unit_price_cents INT NOT NULL, PRIMARY KEY (order_id, product_id))',
  insert('customers', shop.customers),
  insert('products', shop.products),
  insert('orders', shop.orders),
  insert('order_items', shop.items),
]

const mongoDocuments = () => ({
  customers: shop.customers.map(({ id, ...customer }) => ({
    _id: id,
    ...customer,
  })),
  orders: shop.orders.map(({ id, ...order }) => ({
    _id: id,
    ...order,
    items: shop.items
      .filter((item) => item.order_id === id)
      .map(({ order_id: _order, ...item }) => item),
  })),
  products: shop.products.map(({ id, ...product }) => ({
    _id: id,
    ...product,
  })),
})

const toShell = (value: unknown) =>
  JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'string' && /^\d{4}-\d{2}-\d{2}T/u.test(item)
      ? `__date__${item}`
      : item
  ).replaceAll(/"__date__(?<date>[^"]+)"/gu, 'ISODate("$<date>")')

export const seed = async (engine: Engine) => {
  const connectionString = connectionStrings[engine]
  if (engine === 'mongodb') {
    await Promise.all(
      Object.entries(mongoDocuments()).map(async ([collection, documents]) => {
        await mongodb.execute({
          connectionString,
          query: `db.${collection}.drop()`,
        })
        await mongodb.execute({
          connectionString,
          query: `db.${collection}.insertMany(${toShell(documents)})`,
        })
      })
    )
    return
  }
  for (const statement of sqlStatements(
    engine === 'postgres' ? 'TIMESTAMP' : 'DATETIME'
  )) {
    // oxlint-disable-next-line no-await-in-loop
    await executors[engine].execute({ connectionString, query: statement })
  }
}
