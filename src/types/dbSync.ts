export interface SyncEntityCounts {
  parts: number;
  contracts: number;
  coils: number;
  orders: number;
  manufacturingOrders: number;
  inventoryDocs: number;
  transactions: number;
  boms: number;
  routings: number;
}

export interface CloudSyncManifest {
  schemaVersion: 1;
  revision: number;
  contentHash: string;
  updatedAt: string;
  deviceLabel: string;
  counts: SyncEntityCounts;
}

export type GitSyncStatusCode =
  | 'IN_SYNC'
  | 'REMOTE_AHEAD'
  | 'LOCAL_AHEAD'
  | 'DIVERGED'
  | 'CLOUD_NOT_CONFIGURED'
  | 'CLOUD_UNREACHABLE'
  | 'CLOUD_EMPTY';

export interface CloudSyncCheckResult {
  state: GitSyncStatusCode;
  checkedAt: string;
  cached: boolean;
  autoCheckEnabled: boolean;
  checkIntervalSec: number;
  deviceLabel: string;
  cloudConfigured: boolean;
  cloudReachable: boolean;
  latencyMs?: number;
  localHash: string;
  localRevision: number;
  localUpdatedAt?: string;
  localCounts?: SyncEntityCounts;
  lastSyncedCloudHash?: string;
  lastSyncedCloudRevision?: number;
  lastSyncedCloudAt?: string;
  cloudManifest?: CloudSyncManifest | null;
  messageFa: string;
  error?: string;
}
