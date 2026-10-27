import { faker } from '@faker-js/faker/locale/en'

import type { Column } from '~/core/table/cell/utils'

import type { GeneratorDef, GeneratorMap } from './types'
import {
  SQL_EXPRESSION_GENERATOR,
  ENUM_GENERATOR,
  NULL_GENERATOR,
  REFERENCE_GENERATOR,
  SKIP_GENERATOR,
} from './types'

const typeParamsRegex = /\(.*\)|\[\]$/gu

export const columnTypeName = (column: Column) =>
  (column.typeLabel ?? column.type ?? '')
    .toLowerCase()
    .replaceAll(typeParamsRegex, '')
    .trim()

export const columnMaxLength = (column: Column) =>
  column.maxLength && column.maxLength > 0 ? column.maxLength : undefined

const DEFAULT_MAX = 10_000
// One-byte integers: ClickHouse Int8/UInt8, MySQL and MSSQL tinyint. Postgres' int8 is a bigint,
// but only its array label ("int8[]") reaches here and 127 is still a valid bigint.
const ONE_BYTE_INT_MAX: Record<string, number> = {
  int8: 127,
  tinyint: 127,
  uint8: 255,
}

const randomInt = (column: Column) =>
  faker.number.int({
    max: ONE_BYTE_INT_MAX[columnTypeName(column)] ?? DEFAULT_MAX,
  })

const decimalParamsRegex = /\((?<precision>\d+)\s*,\s*(?<scale>\d+)\)/u

const randomFloat = (column: Column) => {
  const parsed = column.typeLabel?.match(decimalParamsRegex)?.groups
  const scale = column.scale ?? Number(parsed?.scale ?? 2)
  const precision =
    column.precision ?? (parsed ? Number(parsed.precision) : undefined)
  const max = precision
    ? Math.min(DEFAULT_MAX, 10 ** (precision - scale))
    : DEFAULT_MAX

  return faker.number.float({
    fractionDigits: scale,
    max: max - 10 ** -scale,
    min: 0,
  })
}

const randomBits = (column: Column) =>
  faker.string.binary({ length: columnMaxLength(column) ?? 8, prefix: '' })

const JSON_MAX_DEPTH = 2
const JSON_LENGTH = { max: 5, min: 1 }

const jsonScalar = () =>
  faker.helpers.arrayElement([
    () => faker.lorem.word(),
    () => faker.number.int({ max: 100_000, min: -100_000 }),
    () =>
      faker.number.float({ fractionDigits: 2, max: 100_000, min: -100_000 }),
    () => faker.datatype.boolean(),
    () => faker.date.recent().toISOString(),
    () => null,
  ])()

const jsonKeys = () =>
  faker.helpers.uniqueArray(
    () => faker.string.alpha({ casing: 'lower', length: { max: 8, min: 3 } }),
    faker.number.int({ max: 6, min: 1 })
  )

type JsonKind = 'array' | 'object' | 'scalar'

const jsonValue = (
  depth: number,
  kind: JsonKind = depth >= JSON_MAX_DEPTH
    ? 'scalar'
    : faker.helpers.arrayElement(['array', 'object', 'scalar'])
): unknown => {
  const child = () => jsonValue(depth + 1)
  if (kind === 'array') {
    return faker.helpers.multiple(child, { count: JSON_LENGTH })
  }
  if (kind === 'object') {
    return Object.fromEntries(jsonKeys().map((key) => [key, child()]))
  }
  return jsonScalar()
}

export const inCategory = <
  T extends Record<string, [label: string, generate: GeneratorDef['generate']]>,
>(
  category: string,
  entries: T
) =>
  Object.fromEntries(
    Object.entries(entries).map(([id, [label, generate]]) => [
      id,
      { category, generate, label },
    ])
  ) as Record<keyof T, GeneratorDef>

const SPECIAL_GENERATORS = inCategory('Special', {
  [SQL_EXPRESSION_GENERATOR]: ['SQL expression', () => null],
  [ENUM_GENERATOR]: ['Enum value', () => null],
  [NULL_GENERATOR]: ['NULL', () => null],
  [REFERENCE_GENERATOR]: ['Existing row', () => null],
  [SKIP_GENERATOR]: ['Database default', () => null],
})

const BOOLEAN_GENERATORS = inCategory('Boolean', {
  'datatype.boolean': ['Boolean', () => faker.datatype.boolean()],
})

const COMMERCE_GENERATORS = inCategory('Commerce', {
  'commerce.department': ['Department', () => faker.commerce.department()],
  'commerce.isbn': ['ISBN', () => faker.commerce.isbn()],
  'commerce.price': ['Price', () => Number(faker.commerce.price())],
  'commerce.productDescription': [
    'Product Description',
    () => faker.commerce.productDescription(),
  ],
  'commerce.productName': ['Product Name', () => faker.commerce.productName()],
  'company.buzzPhrase': ['Buzz Phrase', () => faker.company.buzzPhrase()],
  'company.catchPhrase': ['Catch Phrase', () => faker.company.catchPhrase()],
  'company.name': ['Company Name', () => faker.company.name()],
})

const DATE_GENERATORS = inCategory('Date', {
  'date.birthdate': ['Birthdate', () => faker.date.birthdate()],
  'date.future': ['Future Date', () => faker.date.future()],
  'date.month': ['Month Name', () => faker.date.month()],
  'date.past': ['Past Date', () => faker.date.past()],
  'date.recent': ['Recent Date', () => faker.date.recent()],
  'date.soon': ['Soon Date', () => faker.date.soon()],
  'date.time': ['Time', () => faker.date.recent().toISOString().slice(11, 19)],
  'date.weekday': ['Weekday', () => faker.date.weekday()],
})

const FINANCE_GENERATORS = inCategory('Finance', {
  'finance.accountNumber': [
    'Account Number',
    () => faker.finance.accountNumber(),
  ],
  'finance.amount': ['Amount', () => Number(faker.finance.amount())],
  'finance.bic': ['BIC/SWIFT', () => faker.finance.bic()],
  'finance.bitcoinAddress': [
    'Bitcoin Address',
    () => faker.finance.bitcoinAddress(),
  ],
  'finance.creditCardCVV': [
    'Credit Card CVV',
    () => faker.finance.creditCardCVV(),
  ],
  'finance.creditCardNumber': [
    'Credit Card Number',
    () => faker.finance.creditCardNumber(),
  ],
  'finance.currencyCode': ['Currency Code', () => faker.finance.currencyCode()],
  'finance.currencyName': ['Currency Name', () => faker.finance.currencyName()],
  'finance.ethereumAddress': [
    'Ethereum Address',
    () => faker.finance.ethereumAddress(),
  ],
  'finance.iban': ['IBAN', () => faker.finance.iban()],
  'finance.transactionType': [
    'Transaction Type',
    () => faker.finance.transactionType(),
  ],
})

const ID_GENERATORS = inCategory('ID', {
  'string.nanoid': ['Nano ID', () => faker.string.nanoid()],
  'string.ulid': ['ULID', () => faker.string.ulid()],
  'string.uuidV4': ['UUID v4', () => faker.string.uuid({ version: 4 })],
  'string.uuidV7': ['UUID v7', () => faker.string.uuid({ version: 7 })],
})

const INTERNET_GENERATORS = inCategory('Internet', {
  'image.avatar': ['Avatar URL', () => faker.image.avatar()],
  'image.url': ['Image URL', () => faker.image.url()],
  'internet.displayName': ['Display Name', () => faker.internet.displayName()],
  'internet.domainName': ['Domain Name', () => faker.internet.domainName()],
  'internet.email': ['Email', () => faker.internet.email()],
  'internet.emoji': ['Emoji', () => faker.internet.emoji()],
  'internet.httpMethod': ['HTTP Method', () => faker.internet.httpMethod()],
  'internet.httpStatusCode': [
    'HTTP Status Code',
    () => faker.internet.httpStatusCode(),
  ],
  'internet.ip': ['IPv4 Address', () => faker.internet.ip()],
  'internet.ipv6': ['IPv6 Address', () => faker.internet.ipv6()],
  'internet.mac': ['MAC Address', () => faker.internet.mac()],
  'internet.password': ['Password', () => faker.internet.password()],
  'internet.port': ['Port', () => faker.internet.port()],
  'internet.url': ['URL', () => faker.internet.url()],
  'internet.userAgent': ['User Agent', () => faker.internet.userAgent()],
  'internet.username': ['Username', () => faker.internet.username()],
})

const LOCATION_GENERATORS = inCategory('Location', {
  'location.buildingNumber': [
    'Building Number',
    () => faker.location.buildingNumber(),
  ],
  'location.city': ['City', () => faker.location.city()],
  'location.country': ['Country', () => faker.location.country()],
  'location.countryCode': ['Country Code', () => faker.location.countryCode()],
  'location.county': ['County', () => faker.location.county()],
  'location.latitude': ['Latitude', () => faker.location.latitude()],
  'location.longitude': ['Longitude', () => faker.location.longitude()],
  'location.state': ['State', () => faker.location.state()],
  'location.streetAddress': [
    'Street Address',
    () => faker.location.streetAddress(),
  ],
  'location.timeZone': ['Time Zone', () => faker.location.timeZone()],
  'location.zipCode': ['Zip Code', () => faker.location.zipCode()],
})

const NUMBER_GENERATORS = inCategory('Number', {
  'number.bigInt': [
    'Big Integer',
    () => String(faker.number.bigInt({ max: Number.MAX_SAFE_INTEGER })),
  ],
  'number.binary': ['Bits', randomBits],
  'number.float': ['Decimal', randomFloat],
  'number.int': ['Integer', randomInt],
  'number.percentage': [
    'Percentage',
    () => faker.number.float({ fractionDigits: 2, max: 100, min: 0 }),
  ],
})

const OTHER_GENERATORS = inCategory('Other', {
  'airline.airline': ['Airline', () => faker.airline.airline().name],
  'airline.flightNumber': ['Flight Number', () => faker.airline.flightNumber()],
  'animal.type': ['Animal Type', () => faker.animal.type()],
  'color.hex': ['Color Hex', () => faker.color.rgb({ format: 'hex' })],
  'color.human': ['Color Name', () => faker.color.human()],
  'color.rgb': ['Color RGB', () => faker.color.rgb()],
  'food.dish': ['Dish', () => faker.food.dish()],
  'food.ingredient': ['Ingredient', () => faker.food.ingredient()],
  'hacker.phrase': ['Hacker Phrase', () => faker.hacker.phrase()],
  'json.array': ['JSON Array', () => jsonValue(0, 'array')],
  'json.object': ['JSON Object', () => jsonValue(0, 'object')],
  'music.genre': ['Music Genre', () => faker.music.genre()],
  'phone.imei': ['IMEI', () => faker.phone.imei()],
  'phone.number': ['Phone Number', () => faker.phone.number()],
  'science.chemicalElement': [
    'Chemical Element',
    () => faker.science.chemicalElement().name,
  ],
  'science.unit': ['Unit of Measurement', () => faker.science.unit().name],
  'vehicle.manufacturer': [
    'Vehicle Manufacturer',
    () => faker.vehicle.manufacturer(),
  ],
  'vehicle.vehicle': ['Vehicle', () => faker.vehicle.vehicle()],
  'vehicle.vrm': ['License Plate', () => faker.vehicle.vrm()],
})

const PERSON_GENERATORS = inCategory('Person', {
  'person.bio': ['Bio', () => faker.person.bio()],
  'person.firstName': ['First Name', () => faker.person.firstName()],
  'person.fullName': ['Full Name', () => faker.person.fullName()],
  'person.gender': ['Gender', () => faker.person.gender()],
  'person.jobTitle': ['Job Title', () => faker.person.jobTitle()],
  'person.jobType': ['Job Type', () => faker.person.jobType()],
  'person.lastName': ['Last Name', () => faker.person.lastName()],
  'person.sex': ['Sex', () => faker.person.sex()],
})

const SYSTEM_GENERATORS = inCategory('System', {
  'git.commitSha': ['Git Commit SHA', () => faker.git.commitSha()],
  'system.cron': ['Cron Expression', () => faker.system.cron()],
  'system.fileExt': ['File Extension', () => faker.system.fileExt()],
  'system.fileName': ['File Name', () => faker.system.fileName()],
  'system.filePath': ['File Path', () => faker.system.filePath()],
  'system.mimeType': ['MIME Type', () => faker.system.mimeType()],
  'system.semver': ['Semver Version', () => faker.system.semver()],
})

const TEXT_GENERATORS = inCategory('Text', {
  'lorem.lines': ['Lines', () => faker.lorem.lines()],
  'lorem.paragraph': ['Paragraph', () => faker.lorem.paragraph()],
  'lorem.sentence': ['Sentence', () => faker.lorem.sentence()],
  'lorem.slug': ['Slug', () => faker.lorem.slug()],
  'lorem.text': ['Text Block', () => faker.lorem.text()],
  'lorem.word': ['Word', () => faker.lorem.word()],
  'string.alpha': ['Alpha String', () => faker.string.alpha(10)],
  'string.alphanumeric': ['Alphanumeric', () => faker.string.alphanumeric(10)],
  'string.hexadecimal': [
    'Hex String',
    () => faker.string.hexadecimal({ length: 16, prefix: '' }),
  ],
})

export const BASE_GENERATORS = {
  ...SPECIAL_GENERATORS,
  ...PERSON_GENERATORS,
  ...INTERNET_GENERATORS,
  ...TEXT_GENERATORS,
  ...NUMBER_GENERATORS,
  ...DATE_GENERATORS,
  ...BOOLEAN_GENERATORS,
  ...ID_GENERATORS,
  ...LOCATION_GENERATORS,
  ...COMMERCE_GENERATORS,
  ...FINANCE_GENERATORS,
  ...SYSTEM_GENERATORS,
  ...OTHER_GENERATORS,
} satisfies GeneratorMap
