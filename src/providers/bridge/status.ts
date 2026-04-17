export interface BridgeProviderState {
  externalUserId?: string;
  itemStatus?: number | null;
  itemStatusInfo?: string | null;
  authenticationExpiresAt?: string | null;
  lastTransactionUpdatedAt?: string | null;
  lastItemUpdatedAt?: string | null;
  providerId?: string | number | null;
  providerName?: string | null;
  needsReconnect?: boolean;
}

export interface BridgeItemLike {
  id: string | number;
  provider_id?: string | number | null;
  status?: number | string | null;
  status_code?: number | string | null;
  status_code_info?: string | null;
  authentication_expires_at?: string | null;
  updated_at?: string | null;
}

const SYNCABLE_STATUSES = new Set([0, -2, -3]);

export function getBridgeItemStatus(item: BridgeItemLike): number | null {
  const raw = item.status_code ?? item.status;
  if (raw === undefined || raw === null || raw === "") return null;
  const status = Number(raw);
  return Number.isFinite(status) ? status : null;
}

export function isBridgeItemSyncableStatus(status: number | null): boolean {
  return status !== null && SYNCABLE_STATUSES.has(status);
}

export function buildBridgeProviderState(
  item: BridgeItemLike,
  current: BridgeProviderState = {},
  providerName?: string | null,
): BridgeProviderState {
  const status = getBridgeItemStatus(item);
  return {
    ...current,
    itemStatus: status,
    itemStatusInfo: item.status_code_info ?? current.itemStatusInfo ?? null,
    authenticationExpiresAt: item.authentication_expires_at ?? current.authenticationExpiresAt ?? null,
    lastItemUpdatedAt: item.updated_at ?? current.lastItemUpdatedAt ?? null,
    providerId: item.provider_id ?? current.providerId ?? null,
    providerName: providerName ?? current.providerName ?? null,
    needsReconnect: status === null ? false : !isBridgeItemSyncableStatus(status),
  };
}

export function describeBridgeProviderState(state: BridgeProviderState): string | null {
  if (!state.needsReconnect) return null;
  const status = state.itemStatus != null ? `status ${state.itemStatus}` : "status unknown";
  return state.itemStatusInfo ? `Bridge reconnect required (${status}: ${state.itemStatusInfo})` : `Bridge reconnect required (${status})`;
}
