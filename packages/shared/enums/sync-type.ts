export enum SyncType {
  Cloud = 'cloud',
  CloudWithoutSecrets = 'cloud_without_secrets',
  CloudWithoutConnectionString = 'cloud_without_connection_string',
}

export const SYNC_TYPE_LABELS: Record<SyncType, string> = {
  [SyncType.Cloud]: 'Full',
  [SyncType.CloudWithoutSecrets]: 'No password',
  [SyncType.CloudWithoutConnectionString]: 'Metadata only',
}
