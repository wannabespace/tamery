import type { BlockOperation } from '~/core/queries/policies/shape'

export interface Sys {
  indexes: Indexes
  partitions: Partitions
  stats: Stats
  data_spaces: DataSpaces
  foreign_keys: ForeignKeys
  foreign_key_columns: ForeignKeyColumns
  check_constraints: CheckConstraints
  tables: Tables
  schemas: Schemas
  index_columns: IndexColumns
  columns: Columns
  databases: Databases
  triggers: Triggers
  trigger_events: TriggerEvents
  objects: Objects
  extended_properties: ExtendedProperties
  sql_modules: SqlModules
  security_policies: SecurityPolicies
  security_predicates: SecurityPredicates
}

interface SecurityPolicies {
  object_id: number
  schema_id: number
  name: string
  is_enabled: boolean
  is_not_for_replication: boolean
}

interface SecurityPredicates {
  object_id: number
  security_predicate_id: number
  predicate_definition: string
  operation: 1 | 2 | 3 | 4 | null
  operation_desc: BlockOperation | null
  predicate_type_desc: 'FILTER' | 'BLOCK'
  target_object_id: number
}

interface Databases {
  name: string
  database_id: number
  source_database_id: number | null
  owner_sid: Uint8Array
  create_date: Date
  compatibility_level: number
  collation_name: string | null
  user_access: number
  user_access_desc: string | null
  is_read_only: boolean
  is_auto_shrink_on: boolean
  state: number
  state_desc: string | null
  is_in_standby: boolean
  is_cleanly_shutdown: boolean
  is_supplemental_logging_enabled: boolean
  snapshot_isolation_state: number
  snapshot_isolation_state_desc: string | null
  recovery_model: number
  recovery_model_desc: string | null
  page_verify_option: number
  page_verify_option_desc: string | null
  is_auto_create_stats_on: boolean
  is_auto_update_stats_on: boolean
  is_auto_update_stats_async_on: boolean
  is_ansi_null_default_on: boolean
  is_ansi_nulls_on: boolean
  is_ansi_padding_on: boolean
  is_ansi_warnings_on: boolean
  is_arithabort_on: boolean
  is_concat_null_yields_null_on: boolean
  is_numeric_roundabort_on: boolean
  is_quoted_identifier_on: boolean
  is_recursive_triggers_on: boolean
  is_cursor_close_on_commit_on: boolean
  is_local_cursor_default: boolean
  is_fulltext_enabled: boolean
  is_trustworthy_on: boolean
  is_db_chaining_on: boolean
  is_parameterization_forced: boolean
  is_master_key_encrypted_by_server: boolean
  is_query_store_on: boolean
  is_published: boolean
  is_subscribed: boolean
  is_merge_published: boolean
  is_distributor: boolean
  is_sync_with_backup: boolean
  service_broker_guid: string
  is_broker_enabled: boolean
  log_reuse_wait: number
  log_reuse_wait_desc: string | null
  is_date_correlation_on: boolean
  is_cdc_enabled: boolean
  is_encrypted: boolean
  is_honor_broker_priority_on: boolean
  replica_id: string | null
  group_database_id: string | null
  resource_pool_id: number | null
  default_language_lcid: number | null
  default_language_name: string | null
  default_fulltext_language_lcid: number | null
  default_fulltext_language_name: string | null
  is_nested_triggers_on: boolean | null
  is_transform_noise_words_on: boolean | null
  two_digit_year_cutoff: number | null
  containment: number | null
  containment_desc: string | null
  target_recovery_time_in_seconds: number | null
  delayed_durability: number | null
  delayed_durability_desc: string | null
  is_memory_optimized_elevate_to_snapshot_on: boolean | null
  is_federation_member: boolean | null
  is_remote_data_archive_enabled: boolean | null
  is_mixed_page_allocation_on: boolean | null
}

interface Indexes {
  object_id: number
  index_id: number
  name: string | null
  is_unique: boolean
  is_primary_key: boolean
  is_unique_constraint: boolean
  type_desc: string
  has_filter: boolean
  filter_definition: string | null
  is_disabled: boolean
  ignore_dup_key: boolean
  is_padded: boolean
  fill_factor: number
  allow_row_locks: boolean
  allow_page_locks: boolean
  data_space_id: number
}

interface Partitions {
  object_id: number
  index_id: number
  data_compression: number
}

interface Stats {
  object_id: number
  stats_id: number
  no_recompute: boolean
}

interface DataSpaces {
  data_space_id: number
  is_default: boolean
}

interface Tables {
  object_id: number
  schema_id: number
  name: string
}

interface Schemas {
  schema_id: number
  name: string
}

interface ForeignKeys {
  object_id: number
  name: string
  schema_id: number
  is_disabled: boolean
  is_not_trusted: boolean
  is_not_for_replication: boolean
}

interface ForeignKeyColumns {
  constraint_object_id: number
  constraint_column_id: number
  referenced_object_id: number
  referenced_column_id: number
}

interface CheckConstraints {
  name: string
  schema_id: number
  is_disabled: boolean
  is_not_trusted: boolean
  is_not_for_replication: boolean
}

interface IndexColumns {
  object_id: number
  index_id: number
  column_id: number
  key_ordinal: number
  is_included_column: boolean
  is_descending_key: boolean
}

interface Columns {
  object_id: number
  column_id: number
  name: string
}

interface Triggers {
  name: string
  object_id: number
  parent_class: number
  parent_class_desc: string
  parent_id: number
  type: string
  type_desc: string
  create_date: Date
  modify_date: Date
  is_ms_shipped: boolean
  is_disabled: boolean
  is_not_for_replication: boolean
  is_instead_of_trigger: boolean
}

interface TriggerEvents {
  object_id: number
  type: number
  type_desc: string
  is_first: boolean
  is_last: boolean
  event_group_type: number | null
  event_group_type_desc: string | null
}

interface Objects {
  name: string
  object_id: number
  schema_id: number
  parent_object_id: number
  type: string
  type_desc: string
  is_ms_shipped: boolean
}

interface ExtendedProperties {
  class: number
  major_id: number
  minor_id: number
  name: string
  value: unknown
}

interface SqlModules {
  object_id: number
  definition: string | null
  uses_ansi_nulls: boolean | null
  uses_quoted_identifier: boolean | null
  is_schema_bound: boolean
  execute_as_principal_id: number | null
}
