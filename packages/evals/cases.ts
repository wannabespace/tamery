import { ConnectionType } from '@tamery/shared/enums/connection-type'

import type { Engine } from './fixtures'

interface Question {
  id: string
  /** The expected rows come from these, one per engine; answers are compared as result sets, never as query text. */
  expected: Record<Engine, string>
  /** The order of the rows is part of the answer. */
  ordered?: boolean
  question: string
}

const sql = (text: string) => ({ mysql: text, postgres: text })

const QUESTIONS: Question[] = [
  {
    expected: {
      ...sql('SELECT COUNT(*) FROM customers'),
      mongodb: 'db.customers.aggregate([{ $count: "n" }])',
    },
    id: 'customer-count',
    question: 'How many customers do we have?',
  },
  {
    expected: {
      ...sql("SELECT COUNT(*) FROM orders WHERE status = 'REFUNDED'"),
      mongodb:
        'db.orders.aggregate([{ $match: { status: "REFUNDED" } }, { $count: "n" }])',
    },
    id: 'refunded-count',
    question: 'How many orders were refunded?',
  },
  {
    expected: {
      ...sql(
        "SELECT SUM(total_cents) FROM orders WHERE status IN ('PAID', 'SHIPPED')"
      ),
      mongodb:
        'db.orders.aggregate([{ $match: { status: { $in: ["PAID", "SHIPPED"] } } }, { $group: { _id: null, total: { $sum: "$total_cents" } } }, { $project: { _id: 0, total: 1 } }])',
    },
    id: 'revenue',
    question:
      'What is our total revenue from paid and shipped orders, in cents?',
  },
  {
    expected: {
      ...sql(
        "SELECT c.name, SUM(o.total_cents) AS spent FROM customers c JOIN orders o ON o.customer_id = c.id WHERE o.status IN ('PAID', 'SHIPPED') GROUP BY c.id, c.name ORDER BY spent DESC LIMIT 5"
      ),
      mongodb:
        'db.orders.aggregate([{ $match: { status: { $in: ["PAID", "SHIPPED"] } } }, { $group: { _id: "$customer_id", spent: { $sum: "$total_cents" } } }, { $sort: { spent: -1 } }, { $limit: 5 }, { $lookup: { from: "customers", localField: "_id", foreignField: "_id", as: "c" } }, { $project: { _id: 0, name: { $first: "$c.name" }, spent: 1 } }])',
    },
    id: 'top-customers',
    ordered: true,
    question:
      'Who are our top 5 customers by money spent on paid and shipped orders? Give names and totals in cents, highest first.',
  },
  {
    expected: {
      ...sql('SELECT country, COUNT(*) FROM customers GROUP BY country'),
      mongodb:
        'db.customers.aggregate([{ $group: { _id: "$country", n: { $sum: 1 } } }])',
    },
    id: 'customers-per-country',
    question: 'How many customers are in each country?',
  },
  {
    expected: {
      ...sql(
        'SELECT p.category FROM order_items i JOIN products p ON p.id = i.product_id GROUP BY p.category ORDER BY SUM(i.quantity) DESC LIMIT 1'
      ),
      mongodb:
        'db.orders.aggregate([{ $unwind: "$items" }, { $lookup: { from: "products", localField: "items.product_id", foreignField: "_id", as: "p" } }, { $group: { _id: { $first: "$p.category" }, units: { $sum: "$items.quantity" } } }, { $sort: { units: -1 } }, { $limit: 1 }, { $project: { _id: 1 } }])',
    },
    id: 'top-category',
    question: 'Which product category sold the most units?',
  },
  {
    expected: {
      ...sql('SELECT ROUND(AVG(total_cents)) FROM orders'),
      mongodb:
        'db.orders.aggregate([{ $group: { _id: null, avg: { $avg: "$total_cents" } } }, { $project: { _id: 0, avg: { $round: ["$avg", 0] } } }])',
    },
    id: 'average-order',
    question:
      'What is the average order total in cents, rounded to the nearest cent?',
  },
  {
    expected: {
      ...sql(
        "SELECT COUNT(*) FROM orders WHERE created_at >= '2026-03-01' AND created_at < '2026-04-01'"
      ),
      mongodb:
        'db.orders.aggregate([{ $match: { created_at: { $gte: ISODate("2026-03-01"), $lt: ISODate("2026-04-01") } } }, { $count: "n" }])',
    },
    id: 'march-orders',
    question: 'How many orders were placed in March 2026?',
  },
  {
    expected: {
      ...sql(
        "SELECT COUNT(*) FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.name = 'Emma Nowak'"
      ),
      mongodb:
        'db.customers.aggregate([{ $match: { name: "Emma Nowak" } }, { $lookup: { from: "orders", localField: "_id", foreignField: "customer_id", as: "o" } }, { $project: { _id: 0, n: { $size: "$o" } } }])',
    },
    id: 'customer-orders',
    question: 'How many orders has emma nowak placed?',
  },
  {
    expected: {
      ...sql(
        'SELECT name, price_cents FROM products ORDER BY price_cents DESC LIMIT 1'
      ),
      mongodb:
        'db.products.aggregate([{ $sort: { price_cents: -1 } }, { $limit: 1 }, { $project: { _id: 0, name: 1, price_cents: 1 } }])',
    },
    id: 'priciest-product',
    question: 'What is our most expensive product, and its price in cents?',
  },
  {
    expected: {
      ...sql(
        'SELECT c.email FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = 17'
      ),
      mongodb:
        'db.orders.aggregate([{ $match: { _id: 17 } }, { $lookup: { from: "customers", localField: "customer_id", foreignField: "_id", as: "c" } }, { $project: { _id: 0, email: { $first: "$c.email" } } }])',
    },
    id: 'order-email',
    question: 'What is the email of the customer who placed order 17?',
  },
  {
    expected: {
      mongodb:
        'db.orders.aggregate([{ $group: { _id: { $month: "$created_at" }, n: { $sum: 1 } } }, { $sort: { _id: 1 } }])',
      mysql:
        'SELECT MONTH(created_at), COUNT(*) FROM orders GROUP BY 1 ORDER BY 1',
      postgres:
        'SELECT EXTRACT(MONTH FROM created_at), COUNT(*) FROM orders GROUP BY 1 ORDER BY 1',
    },
    id: 'orders-per-month',
    ordered: true,
    question:
      'Show the number of orders per month (by month number) in 2026, in month order.',
  },
  {
    expected: {
      ...sql(
        "SELECT c.country, COUNT(*) FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.status = 'PENDING' GROUP BY c.country"
      ),
      mongodb:
        'db.orders.aggregate([{ $match: { status: "PENDING" } }, { $lookup: { from: "customers", localField: "customer_id", foreignField: "_id", as: "c" } }, { $group: { _id: { $first: "$c.country" }, n: { $sum: 1 } } }])',
    },
    id: 'pending-per-country',
    question: 'How many pending orders are there per customer country?',
  },
  {
    expected: {
      ...sql(
        "SELECT COUNT(*) FROM customers WHERE created_at >= '2025-10-01' AND created_at < '2026-01-01'"
      ),
      mongodb:
        'db.customers.aggregate([{ $match: { created_at: { $gte: ISODate("2025-10-01"), $lt: ISODate("2026-01-01") } } }, { $count: "n" }])',
    },
    id: 'q4-signups',
    question: 'How many customers signed up in the last quarter of 2025?',
  },
  {
    expected: {
      ...sql(
        "SELECT p.category, SUM(i.quantity * i.unit_price_cents) FROM order_items i JOIN products p ON p.id = i.product_id JOIN orders o ON o.id = i.order_id WHERE o.status <> 'REFUNDED' GROUP BY p.category"
      ),
      mongodb:
        'db.orders.aggregate([{ $match: { status: { $ne: "REFUNDED" } } }, { $unwind: "$items" }, { $lookup: { from: "products", localField: "items.product_id", foreignField: "_id", as: "p" } }, { $group: { _id: { $first: "$p.category" }, revenue: { $sum: { $multiply: ["$items.quantity", "$items.unit_price_cents"] } } } }])',
    },
    id: 'category-revenue',
    question:
      'What is the revenue in cents per product category, from the order lines of orders that were not refunded?',
  },
  {
    expected: {
      ...sql(
        'SELECT id, total_cents FROM orders ORDER BY total_cents DESC, id LIMIT 1'
      ),
      mongodb:
        'db.orders.aggregate([{ $sort: { total_cents: -1, _id: 1 } }, { $limit: 1 }, { $project: { total_cents: 1 } }])',
    },
    id: 'largest-order',
    question:
      'Which order has the largest total? Give its id and total in cents (lowest id on a tie).',
  },
  {
    expected: {
      ...sql(
        "SELECT COUNT(DISTINCT customer_id) FROM orders WHERE status = 'REFUNDED'"
      ),
      mongodb:
        'db.orders.aggregate([{ $match: { status: "REFUNDED" } }, { $group: { _id: "$customer_id" } }, { $count: "n" }])',
    },
    id: 'refunding-customers',
    question: 'How many different customers have had at least one refund?',
  },
  {
    expected: {
      ...sql(
        'SELECT ROUND(AVG(n), 2) FROM (SELECT COUNT(*) AS n FROM order_items GROUP BY order_id) per_order'
      ),
      mongodb:
        'db.orders.aggregate([{ $group: { _id: null, avg: { $avg: { $size: "$items" } } } }, { $project: { _id: 0, avg: { $round: ["$avg", 2] } } }])',
    },
    id: 'lines-per-order',
    question:
      'On average, how many different products does an order contain? Round to two decimals.',
  },
]

const ENGINES: Engine[] = [
  ConnectionType.Postgres,
  ConnectionType.MySQL,
  ConnectionType.MongoDB,
]

export const cases = ENGINES.flatMap((engine) =>
  QUESTIONS.map(({ expected, id, ordered = false, question }) => ({
    engine,
    expected: expected[engine],
    id: `${engine}/${id}`,
    ordered,
    question,
  }))
)

export type EvalCase = (typeof cases)[number]
