export interface PgCatalog {
  pg_namespace: PgNamespace
  pg_class: PgClass
  pg_constraint: PgConstraint
  pg_index: PgIndex
  pg_stat_user_indexes: PgStatUserIndexes
  pg_attribute: PgAttribute
  pg_settings: PgSettings
  pg_policies: PgPolicies
  pg_database: PgDatabase
  pg_am: PgAm
  pg_trigger: PgTrigger
  pg_proc: PgProc
  pg_language: PgLanguage
  pg_type: PgType
  pg_attrdef: PgAttrdef
}

interface PgPolicies {
  schemaname: string
  tablename: string
  policyname: string
  permissive: 'PERMISSIVE' | 'RESTRICTIVE'
  roles: string[]
  cmd: string
  qual: string | null
  with_check: string | null
}

interface PgDatabase {
  datname: string
  datistemplate: boolean
}

interface PgSettings {
  name: string
  setting: string
}

interface PgNamespace {
  oid: number
  nspname: string
  nspowner: number
  nspacl: string | null
}

interface PgClass {
  oid: number
  relname: string
  relnamespace: number
  reltype: number
  reloftype: number
  relowner: number
  relam: number
  relfilenode: number
  reltablespace: number
  relpages: number
  reltuples: number
  relallvisible: number
  reltoastrelid: number
  relhasindex: boolean
  relisshared: boolean
  relpersistence: string
  relkind: string
  relnatts: number
  relchecks: number
  relhasrules: boolean
  relhastriggers: boolean
  relhassubclass: boolean
  relrowsecurity: boolean
  relforcerowsecurity: boolean
  relispopulated: boolean
  relreplident: string
  relispartition: boolean
  relrewrite: number
  relfrozenxid: string
  relminmxid: string
  relacl: string | null
  relpartbound: string | null
}

interface PgConstraint {
  oid: number
  conname: string
  connamespace: number
  contype: string
  conrelid: number
  confrelid: number
  conkey: number[] | null
  confkey: number[] | null
  confdeltype: string
  confupdtype: string
  confmatchtype: string
  condeferrable: boolean
  convalidated: boolean
  connoinherit: boolean
  conindid: number
  coninhcount: number
}

interface PgIndex {
  indrelid: number
  indexrelid: number
  indkey: unknown
  indoption: unknown
  indpred: string | null
  indnatts: number
  indnkeyatts: number
  indisunique: boolean
  indisprimary: boolean
}

interface PgStatUserIndexes {
  indexrelid: number
  idx_scan: string
}

interface PgAttribute {
  attrelid: number
  attname: string
  atttypid: number
  attlen: number
  attnum: number
  atttypmod: number
  attndims: number
  attbyval: boolean
  attalign: string
  attstorage: string
  attcompression: string
  attnotnull: boolean
  atthasdef: boolean
  atthasmissing: boolean
  attidentity: string
  attgenerated: string
  attisdropped: boolean
  attislocal: boolean
  attinhcount: number
  attcollation: number
  attstattarget: number | null
  attacl: unknown | null
  attoptions: string[] | null
  attmissingval: unknown | null
}

interface PgAm {
  oid: number
  amname: string
  amhandler: string
  amtype: string
}

interface PgTrigger {
  oid: number
  tgrelid: number
  tgname: string
  tgfoid: number
  tgtype: number
  tgenabled: string
  tgisinternal: boolean
  tgconstraint: number
  tgnargs: number
  tgqual: string | null
}

interface PgProc {
  oid: number
  proname: string
  pronamespace: number
  prokind: string
  prorettype: number
  prolang: number
  provolatile: string
  prosecdef: boolean
  prosrc: string
  pronargs: number
  proargtypes: string
}

interface PgLanguage {
  oid: number
  lanname: string
}

interface PgType {
  oid: number
  typname: string
  typnamespace: number
  typelem: number
  typarray: number
}

interface PgAttrdef {
  oid: number
  adrelid: number
  adnum: number
  adbin: string
}
