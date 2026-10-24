import type { MongoDatabase } from '~/core/runtime/dialects/mongodb'

export const mongodbConstraints = async (db: MongoDatabase) => {
  const collections = await db.collections()
  return collections
    .filter(({ type: kind }) => kind !== 'view')
    .map(({ name }) => ({
      column: '_id',
      foreign_column: null,
      foreign_schema: null,
      foreign_table: null,
      name: '_id_',
      onDelete: null,
      onUpdate: null,
      schema: db.name,
      table: name,
      type: 'PRIMARY KEY' as const,
    }))
}
